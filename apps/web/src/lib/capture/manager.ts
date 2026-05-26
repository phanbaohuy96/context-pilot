import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { MeetingSourceChannel, MeetingSpeakerRole } from "@prisma/client";
import {
  assignSpeaker,
  DEFAULT_SPEAKER_SIMILARITY_THRESHOLD,
  isLikelyHallucinatedTranscription,
  meanTokenConfidence,
  speakerLabel,
  type SpeakerCluster,
  type TranscriptionSegment,
} from "@teams-observer/core";
import { prisma } from "@teams-observer/db";
import { createDeterministicMeetingInsights } from "../meeting-insights";
import { maybeGenerateMeetingNotes } from "../meeting-notes";
import { embedSpeaker, speakerSimilarityThreshold, warmupDiarizer } from "./diarizer";

// Short frames are the VAD resolution: each is classified speech/silence, then
// consecutive speech frames are stitched into one utterance and flushed on a pause.
// Natural inter-sentence pauses in real meetings are short (median ~0.5s), so the
// frame must be small enough to land entirely inside one — measured against a real
// 25-min recording, 0.5s cuts on a real pause ~86% of the time (vs ~33% at 1.5s,
// where the 24s cap dominated and chopped sentences mid-clause). Transcription is
// unaffected by frame size: whisper always runs on the concatenated speech buffer.
const FRAME_SECONDS = 0.5;
// Force-flush a long monologue with no pause so latency stays bounded.
const MAX_UTTERANCE_FRAMES = Math.ceil(24 / FRAME_SECONDS);
// Re-transcribe the growing utterance this often (in frames) to refine the interim
// line (~3s cadence). The first frame always shows immediately for low first-word
// latency, so a smaller frame also means a faster first caption.
const INTERIM_EVERY_FRAMES = 6;

type SourceKind = "MIC" | "MEETING";

export type CaptureSourceStatus = {
  source: SourceKind;
  label: string;
  input: string;
  running: boolean;
  utterances: number;
  lastText?: string;
  lastError?: string;
};

export type CaptureStatus = {
  meetingId: string;
  running: boolean;
  startedAt: string;
  sources: CaptureSourceStatus[];
};

export type StartCaptureOptions = {
  mic?: string;
  meeting?: string;
};

function whisperCommand(): string {
  return process.env.MEETING_CAPTURE_TRANSCRIBE_COMMAND ?? "whisper-cli";
}

function whisperModelPath(): string {
  return process.env.MEETING_CAPTURE_WHISPER_MODEL
    ?? join(homedir(), ".cache", "teams-discovery-observer", "models", "ggml-tiny.en.bin");
}

function ffmpegFormat(): string {
  return process.env.MEETING_CAPTURE_FFMPEG_FORMAT ?? "avfoundation";
}

function normalizeTranscription(text: string): string {
  return text
    .replaceAll(/\[[^\]]*\]/g, " ")
    .replaceAll(/\([^)]*\)/g, " ")
    .replaceAll(/\*[^*]*\*/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function silenceThresholdDb(): number {
  const parsed = Number(process.env.MEETING_CAPTURE_SILENCE_MAX_DB);
  return Number.isFinite(parsed) ? parsed : -45;
}

// Returns the segment's peak level in dBFS (0 = full scale). Resolves to 0 (treated
// as "not silent") if ffmpeg fails, so a measurement error never drops real speech.
function detectMaxVolumeDb(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-nostats", "-i", audioPath, "-af", "volumedetect", "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const match = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
      resolve(match ? Number(match[1]) : 0);
    });
  });
}

// Stitches consecutive speech frames into one wav so a sentence stays in a single
// utterance instead of being cut at frame boundaries.
async function concatFrames(dir: string, framePaths: string[], outputPath: string): Promise<void> {
  const listPath = join(dir, `concat-${randomUUID()}.txt`);
  const listBody = framePaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n");
  await writeFile(listPath, listBody);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", listPath,
        "-ac", "1", "-ar", "16000", outputPath,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        code === 0 ? resolve() : reject(new Error(`ffmpeg concat exited ${code}: ${stderr.trim()}`));
      });
    });
  } finally {
    await rm(listPath, { force: true }).catch(() => undefined);
  }
}

// Runs whisper and returns the transcript from stdout. When `jsonBase` is given it
// also writes `<jsonBase>.json` (token-level data) via -ojf, which the caller parses
// for a confidence score. The text path is identical with or without it.
function runWhisper(audioPath: string, jsonBase?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-m", whisperModelPath(), "-f", audioPath, "-nt", "-np"];
    if (jsonBase) {
      args.push("-ojf", "-of", jsonBase);
    }
    const child = spawn(whisperCommand(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`whisper exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}

// Reads a whisper -ojf JSON file and returns the utterance confidence (mean token
// probability). Returns undefined on any read/parse problem (fail-soft); the scoring
// itself is the pure, tested meanTokenConfidence in @teams-observer/core.
async function readTranscriptionConfidence(jsonPath: string): Promise<number | undefined> {
  try {
    const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as { transcription?: TranscriptionSegment[] };
    return meanTokenConfidence(parsed.transcription ?? []);
  } catch {
    return undefined;
  }
}

class CaptureRunner {
  private ffmpeg?: ChildProcess;
  private dir = "";
  private poll?: ReturnType<typeof setInterval>;
  private nextIndex = 0;
  private speechFrames: number[] = [];
  private currentUtteranceId?: string;
  private framesSinceTranscribe = 0;
  private draining = false;
  private exited = false;
  // Set when ffmpeg starts (audio offset 0). Frame index i covers audio
  // [i, i+1) * FRAME_SECONDS from here, which gives real per-utterance start/end times
  // instead of row-creation wall-clock.
  private captureStartedAt = new Date();
  // Per-meeting speaker centroids; only used when this runner diarizes (the "others"
  // channel, which carries multiple participants). Mic audio is a single speaker.
  private readonly speakerClusters: SpeakerCluster[] = [];
  private readonly similarityThreshold = speakerSimilarityThreshold(DEFAULT_SPEAKER_SIMILARITY_THRESHOLD);

  running = false;
  utterances = 0;
  lastText?: string;
  lastError?: string;

  constructor(
    private readonly meetingId: string,
    readonly source: SourceKind,
    readonly label: string,
    private readonly input: string,
    private readonly speakerRole: MeetingSpeakerRole,
    private readonly sourceChannel: MeetingSourceChannel,
    private readonly diarize: boolean,
  ) {}

  async start(): Promise<void> {
    // Preload the speaker model now so its cold load overlaps capture instead of
    // stalling the first finalized utterance.
    if (this.diarize) {
      warmupDiarizer();
    }
    this.dir = await mkdtemp(join(tmpdir(), "meeting-capture-"));
    const segmentPattern = join(this.dir, "seg_%05d.wav");

    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", ffmpegFormat(), "-i", this.input,
      "-ac", "1",
      "-ar", "16000",
      "-f", "segment",
      "-segment_time", String(FRAME_SECONDS),
      "-reset_timestamps", "1",
      segmentPattern,
    ];

    this.captureStartedAt = new Date();
    this.ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    this.running = true;
    this.ffmpeg.stderr?.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        this.lastError = message.slice(0, 500);
      }
    });
    this.ffmpeg.on("error", (error) => {
      this.lastError = error.message;
      this.exited = true;
    });
    this.ffmpeg.on("close", () => {
      this.exited = true;
    });

    this.poll = setInterval(() => {
      void this.drain();
    }, 1000);
  }

  private framePath(index: number): string {
    return join(this.dir, `seg_${String(index).padStart(5, "0")}.wav`);
  }

  // Wall-clock time of the start of frame `index` (its audio offset from capture
  // start). The end of an utterance is the start of the frame after its last one.
  private frameTime(index: number): Date {
    return new Date(this.captureStartedAt.getTime() + index * FRAME_SECONDS * 1000);
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      const entries = await readdir(this.dir).catch(() => [] as string[]);
      const available = new Set(
        entries
          .filter((name) => /^seg_\d+\.wav$/.test(name))
          .map((name) => Number(name.replace(/\D/g, ""))),
      );
      const maxIndex = available.size ? Math.max(...available) : -1;
      // The newest frame may still be mid-write; only classify it once ffmpeg exits.
      const lastComplete = this.exited ? maxIndex : maxIndex - 1;

      while (this.nextIndex <= lastComplete) {
        const index = this.nextIndex;
        this.nextIndex += 1;
        if (available.has(index)) {
          await this.classifyFrame(index);
        }
      }

      if (this.exited && this.nextIndex > maxIndex) {
        await this.finalizeUtterance();
        this.stopPolling();
        this.running = false;
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.draining = false;
    }
  }

  // A frame above the silence floor is speech and joins the current utterance; a
  // silent frame is a pause, so it finalizes whatever speech has accumulated.
  private async classifyFrame(index: number): Promise<void> {
    const framePath = this.framePath(index);
    const maxDb = await detectMaxVolumeDb(framePath);

    if (maxDb > silenceThresholdDb()) {
      this.speechFrames.push(index);
      this.framesSinceTranscribe += 1;
      if (this.speechFrames.length >= MAX_UTTERANCE_FRAMES) {
        await this.finalizeUtterance();
        return;
      }
      // Show the first frame right away, then refine the line every few frames.
      if (!this.currentUtteranceId || this.framesSinceTranscribe >= INTERIM_EVERY_FRAMES) {
        await this.updateInterim();
      }
      return;
    }

    await rm(framePath, { force: true });
    await this.finalizeUtterance();
  }

  private async transcribeFrames(frames: number[]): Promise<string> {
    const framePaths = frames.map((index) => this.framePath(index));
    const utterancePath = join(this.dir, `utt_${frames[0]}_${randomUUID()}.wav`);
    try {
      await concatFrames(this.dir, framePaths, utterancePath);
      return normalizeTranscription(await runWhisper(utterancePath));
    } finally {
      await rm(utterancePath, { force: true }).catch(() => undefined);
    }
  }

  // Like transcribeFrames but also asks whisper for token-level JSON so we can attach
  // a confidence score. Used on finalize only; interim refines stay on the fast path.
  private async transcribeFramesWithConfidence(frames: number[]): Promise<{ text: string; confidence?: number }> {
    const framePaths = frames.map((index) => this.framePath(index));
    const base = join(this.dir, `utt_${frames[0]}_${randomUUID()}`);
    const utterancePath = `${base}.wav`;
    const jsonPath = `${base}.json`;
    try {
      await concatFrames(this.dir, framePaths, utterancePath);
      const text = normalizeTranscription(await runWhisper(utterancePath, base));
      const confidence = await readTranscriptionConfidence(jsonPath);
      return { text, confidence };
    } finally {
      await rm(utterancePath, { force: true }).catch(() => undefined);
      await rm(jsonPath, { force: true }).catch(() => undefined);
    }
  }

  // Embeds the utterance's voice and groups it into a stable per-meeting speaker key.
  // Returns metadata to merge into the row, or {} when diarization is off/unavailable
  // so a model failure never blocks the transcript.
  private async classifySpeaker(frames: number[]): Promise<{ speakerKey?: number; speakerLabel?: string }> {
    if (!this.diarize) {
      return {};
    }
    const framePaths = frames.map((index) => this.framePath(index));
    const embedPath = join(this.dir, `emb_${frames[0]}_${randomUUID()}.wav`);
    try {
      await concatFrames(this.dir, framePaths, embedPath);
      const embedding = await embedSpeaker(embedPath);
      if (!embedding) {
        return {};
      }
      const key = assignSpeaker(this.speakerClusters, embedding, this.similarityThreshold);
      return { speakerKey: key, speakerLabel: speakerLabel(key) };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return {};
    } finally {
      await rm(embedPath, { force: true }).catch(() => undefined);
    }
  }

  // Re-transcribes the growing buffer and updates the same row in place, so the UI
  // shows a fast partial line that refines as more audio arrives. No insights yet.
  private async updateInterim(): Promise<void> {
    if (!this.speechFrames.length) {
      return;
    }
    try {
      const text = await this.transcribeFrames(this.speechFrames);
      if (!text || isLikelyHallucinatedTranscription(text)) {
        return;
      }
      if (this.currentUtteranceId) {
        await prisma.transcriptUtterance.update({
          where: { id: this.currentUtteranceId },
          data: { text },
        });
      } else {
        const utterance = await prisma.transcriptUtterance.create({
          data: {
            meetingSessionId: this.meetingId,
            speakerRole: this.speakerRole,
            sourceChannel: this.sourceChannel,
            startedAt: this.frameTime(this.speechFrames[0]),
            text,
            engineMetadata: { captureSource: this.label, interim: true },
          },
        });
        this.currentUtteranceId = utterance.id;
        this.utterances += 1;
      }
      this.lastText = text;
      this.framesSinceTranscribe = 0;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  // On a pause: do a final transcription of the whole buffer, mark the row final,
  // and run assist detection once on the complete text.
  private async finalizeUtterance(): Promise<void> {
    const frames = this.speechFrames;
    const utteranceId = this.currentUtteranceId;
    this.speechFrames = [];
    this.currentUtteranceId = undefined;
    this.framesSinceTranscribe = 0;

    if (!frames.length) {
      return;
    }
    const framePaths = frames.map((index) => this.framePath(index));

    try {
      const { text, confidence } = await this.transcribeFramesWithConfidence(frames);
      if (!text || isLikelyHallucinatedTranscription(text)) {
        // The buffered audio transcribed to nothing, or to a stock Whisper
        // silence-hallucination phrase (a quiet mic picking up room noise). If an
        // interim line was already shown for it, retract that row instead of leaving
        // it stuck as "refining" forever.
        if (utteranceId) {
          await prisma.transcriptUtterance.delete({ where: { id: utteranceId } }).catch(() => undefined);
          this.utterances -= 1;
        }
        return;
      }

      // Audio-relative span from the frame indices: real start/end and a duration,
      // not row-creation wall-clock.
      const startedAt = this.frameTime(frames[0]);
      const endedAt = this.frameTime(frames[frames.length - 1] + 1);

      // Write the transcript + run assist detection first so neither waits on the
      // embedding model (a cold first-utterance load could otherwise stall the row).
      const finalMetadata = { captureSource: this.label, frames: frames.length };
      const id = utteranceId ?? (await prisma.transcriptUtterance.create({
        data: {
          meetingSessionId: this.meetingId,
          speakerRole: this.speakerRole,
          sourceChannel: this.sourceChannel,
          startedAt,
          endedAt,
          confidence,
          text,
          engineMetadata: finalMetadata,
        },
      })).id;

      if (utteranceId) {
        await prisma.transcriptUtterance.update({
          where: { id },
          data: { text, startedAt, endedAt, confidence, engineMetadata: finalMetadata },
        });
      } else {
        this.utterances += 1;
      }

      await createDeterministicMeetingInsights({
        meetingSessionId: this.meetingId,
        utteranceId: id,
        speakerRole: this.speakerRole,
        text,
      });
      this.lastText = text;

      // Then label the speaker and patch the row in place; the UI picks it up on its
      // next poll. A miss leaves the line as an unlabelled "Participant".
      const speaker = await this.classifySpeaker(frames);
      if (speaker.speakerKey != null) {
        await prisma.transcriptUtterance.update({
          where: { id },
          data: { engineMetadata: { ...finalMetadata, ...speaker } },
        });
      }

      // Refresh the rolling LLM notes off the capture path (throttled per meeting).
      void maybeGenerateMeetingNotes(this.meetingId);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      await Promise.all(framePaths.map((path) => rm(path, { force: true })));
    }
  }

  private stopPolling(): void {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  async stop(): Promise<void> {
    this.stopPolling();
    this.running = false;
    if (this.ffmpeg && !this.ffmpeg.killed) {
      this.ffmpeg.kill("SIGTERM");
    }
    // Persist the trailing words still buffered when the user stops mid-sentence.
    await this.finalizeUtterance().catch(() => undefined);
    if (this.dir) {
      await rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  status(): CaptureSourceStatus {
    return {
      source: this.source,
      label: this.label,
      input: this.input,
      running: this.running,
      utterances: this.utterances,
      lastText: this.lastText,
      lastError: this.lastError,
    };
  }
}

class MeetingCapture {
  readonly startedAt = new Date();
  runners: CaptureRunner[] = [];

  constructor(readonly meetingId: string) {}

  async stop(): Promise<void> {
    await Promise.all(this.runners.map((runner) => runner.stop()));
    this.runners = [];
  }

  status(): CaptureStatus {
    const sources = this.runners.map((runner) => runner.status());
    return {
      meetingId: this.meetingId,
      running: sources.some((source) => source.running),
      startedAt: this.startedAt.toISOString(),
      sources,
    };
  }
}

const captures = new Map<string, MeetingCapture>();

export async function startCapture(meetingId: string, options: StartCaptureOptions): Promise<CaptureStatus> {
  await stopCapture(meetingId);

  const capture = new MeetingCapture(meetingId);
  if (options.mic) {
    // Mic is a single speaker (you), so no diarization needed.
    capture.runners.push(
      new CaptureRunner(meetingId, "MIC", "microphone", options.mic, "SELF", "MIC", false),
    );
  }
  if (options.meeting) {
    // The "others" channel carries every remote participant — diarize it.
    capture.runners.push(
      new CaptureRunner(meetingId, "MEETING", "meeting-audio", options.meeting, "OTHER", "LOOPBACK", true),
    );
  }

  if (!capture.runners.length) {
    throw new Error("Select a microphone or a meeting audio device before starting capture.");
  }

  captures.set(meetingId, capture);
  await Promise.all(capture.runners.map((runner) => runner.start()));
  return capture.status();
}

export async function stopCapture(meetingId: string): Promise<void> {
  const capture = captures.get(meetingId);
  if (!capture) {
    return;
  }
  captures.delete(meetingId);
  await capture.stop();
}

export function getCaptureStatus(meetingId: string): CaptureStatus | null {
  return captures.get(meetingId)?.status() ?? null;
}
