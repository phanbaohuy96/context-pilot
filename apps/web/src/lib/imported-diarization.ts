import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import {
  assignSpeaker,
  DEFAULT_SPEAKER_SIMILARITY_THRESHOLD,
  metadataWithDiarizedSpeaker,
  speakerLabel,
  type SpeakerCluster,
} from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import { embedSpeaker, speakerSimilarityThreshold } from "./capture/diarizer";

const MIN_UTTERANCE_SECONDS = 1.2;
const ALLOWED_EXTENSIONS = new Set([".mp3", ".mp4", ".m4a", ".mov", ".wav", ".webm"]);

type DiarizableUtterance = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  engineMetadata: unknown;
  speakerRole: string;
  sourceChannel: string;
};

export type ImportedDiarizationResult = {
  considered: number;
  labeled: number;
  skipped: number;
  speakers: number;
  errors: string[];
};

function resolveTmpRoot(): string {
  const candidates = [
    resolve(process.cwd(), "tmp"),
    resolve(process.cwd(), "..", "..", "tmp"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function importedMediaFileName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const fileName = value.trim();
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    return null;
  }
  if (!ALLOWED_EXTENSIONS.has(extname(fileName).toLowerCase())) {
    return null;
  }
  return fileName;
}

function resolveMediaPath(fileName: string): string {
  const tmpRoot = resolveTmpRoot();
  const mediaPath = resolve(tmpRoot, fileName);
  if (!mediaPath.startsWith(`${tmpRoot}/`)) {
    throw new Error("Media file must resolve under tmp/.");
  }
  if (!existsSync(mediaPath)) {
    throw new Error("Media file was not found under tmp/.");
  }
  return mediaPath;
}

export function importedUtteranceSpanSeconds(meetingStartedAt: Date, utterance: DiarizableUtterance): { start: number; duration: number } | null {
  if (utterance.speakerRole !== "OTHER" || utterance.sourceChannel !== "IMPORTED" || !utterance.endedAt) {
    return null;
  }
  const start = Math.max(0, (utterance.startedAt.getTime() - meetingStartedAt.getTime()) / 1000);
  const duration = (utterance.endedAt.getTime() - utterance.startedAt.getTime()) / 1000;
  if (duration < MIN_UTTERANCE_SECONDS) {
    return null;
  }
  return { start, duration };
}

function extractAudioSlice(inputPath: string, outputPath: string, start: number, duration: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", start.toFixed(3), "-t", duration.toFixed(3), "-i", inputPath,
      "-vn", "-ac", "1", "-ar", "16000", outputPath,
    ], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      code === 0 ? resolvePromise() : reject(new Error("Could not slice imported audio for diarization."));
    });
  });
}

export async function diarizeImportedMeeting(meetingId: string, mediaFile: string): Promise<ImportedDiarizationResult> {
  const fileName = importedMediaFileName(mediaFile);
  if (!fileName) {
    throw new Error("Provide a valid imported media file.");
  }
  const meeting = await prisma.meetingSession.findUnique({
    where: { id: meetingId },
    include: { utterances: { orderBy: { startedAt: "asc" } } },
  });
  if (!meeting) {
    throw new Error("Meeting session was not found.");
  }
  if (importedMediaFileName(meeting.externalContextId) !== fileName) {
    throw new Error("Meeting is not linked to that imported recording.");
  }

  const mediaPath = resolveMediaPath(fileName);
  const dir = await mkdtemp(join(tmpdir(), "teams-import-diarize-"));
  const clusters: SpeakerCluster[] = [];
  const threshold = speakerSimilarityThreshold(DEFAULT_SPEAKER_SIMILARITY_THRESHOLD);
  const errors: string[] = [];
  let considered = 0;
  let labeled = 0;
  let skipped = 0;

  try {
    for (const utterance of meeting.utterances) {
      const span = importedUtteranceSpanSeconds(meeting.startedAt, utterance);
      if (!span) {
        skipped += 1;
        continue;
      }
      considered += 1;
      const wavPath = join(dir, `${utterance.id}-${randomUUID()}.wav`);
      try {
        await extractAudioSlice(mediaPath, wavPath, span.start, span.duration);
        const embedding = await embedSpeaker(wavPath, { force: true });
        if (!embedding) {
          skipped += 1;
          continue;
        }
        const key = assignSpeaker(clusters, embedding, threshold);
        await prisma.transcriptUtterance.update({
          where: { id: utterance.id },
          data: {
            engineMetadata: metadataWithDiarizedSpeaker(utterance.engineMetadata, key, speakerLabel(key)) as Prisma.InputJsonValue,
          },
        });
        labeled += 1;
      } catch {
        skipped += 1;
        errors.push("Could not diarize one transcript line.");
      } finally {
        await rm(wavPath, { force: true }).catch(() => undefined);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (!considered) {
    throw new Error("Meeting has no imported remote transcript lines to diarize.");
  }

  return { considered, labeled, skipped, speakers: clusters.length, errors: errors.slice(0, 5) };
}
