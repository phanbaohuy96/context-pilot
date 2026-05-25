import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMeetingSessionSchema,
  ingestTranscriptUtteranceSchema,
  meetingPlatformSchema,
  meetingSourceChannelSchema,
  meetingSpeakerRoleSchema,
} from "@teams-observer/core";

const defaultApiBaseUrl = process.env.MEETING_ASSISTANT_API_BASE_URL ?? "http://localhost:3000";

type Flags = Record<string, string | true>;
type RunResult = { stdout: string; stderr: string; code: number | null };
type CaptureSourceConfig = {
  label: string;
  input: string;
  format: string;
  speakerRole: "SELF" | "OTHER" | "UNKNOWN";
  sourceChannel: "MIC" | "LOOPBACK" | "MIXED" | "IMPORTED";
  seconds: number;
  baseUrl: string;
  meetingId: string;
};

async function main(): Promise<void> {
  const [command = "help", ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "check") {
    await checkEnvironment(flags);
    return;
  }

  if (command === "devices") {
    await listDevices();
    return;
  }

  if (command === "create-session") {
    await createSession(flags);
    return;
  }

  if (command === "send-text") {
    await sendText(flags);
    return;
  }

  if (command === "capture-once") {
    await captureOnce(flags);
    return;
  }

  if (command === "capture-loop") {
    await captureLoop(flags);
    return;
  }

  if (command === "capture-live") {
    await captureLive(flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      flags[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[withoutPrefix] = true;
      continue;
    }

    flags[withoutPrefix] = next;
    index += 1;
  }

  return flags;
}

function stringFlag(flags: Flags, name: string, fallback?: string): string | undefined {
  const value = flags[name];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function requiredFlag(flags: Flags, name: string): string {
  const value = stringFlag(flags, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function numberFlag(flags: Flags, name: string, fallback: number): number {
  const value = stringFlag(flags, name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number.`);
  }
  return parsed;
}

function apiBaseUrl(flags: Flags): string {
  return stringFlag(flags, "api-base", defaultApiBaseUrl) ?? defaultApiBaseUrl;
}

async function checkEnvironment(flags: Flags): Promise<void> {
  await fetchJson("/api/meetings", { method: "GET", baseUrl: apiBaseUrl(flags) });
  console.log(`API reachable: ${apiBaseUrl(flags)}`);

  const ffmpeg = await run("ffmpeg", ["-version"], { allowFailure: true });
  console.log(`ffmpeg: ${ffmpeg.code === 0 ? "available" : "not found"}`);

  const transcribeCommand = transcribeCommandName();
  const transcribeArgs = process.env.MEETING_CAPTURE_TRANSCRIBE_ARGS;
  console.log(`transcriber command: ${transcribeCommand}`);
  console.log(`transcriber args: ${transcribeArgs ? "configured" : "default local Whisper tiny.en"}`);
}

async function listDevices(): Promise<void> {
  if (process.platform !== "darwin") {
    console.log("Device listing is currently implemented for macOS ffmpeg avfoundation only.");
    console.log("For other platforms, set MEETING_CAPTURE_FFMPEG_FORMAT and MEETING_CAPTURE_FFMPEG_INPUT manually.");
    return;
  }

  const result = await run("ffmpeg", ["-f", "avfoundation", "-list_devices", "true", "-i", ""], {
    allowFailure: true,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  console.log(output || "No ffmpeg device output returned.");
}

async function createSession(flags: Flags): Promise<void> {
  const payload = createMeetingSessionSchema.parse({
    title: stringFlag(flags, "title", "Untitled meeting"),
    platform: meetingPlatformSchema.parse(stringFlag(flags, "platform", "OTHER")),
    externalContextId: stringFlag(flags, "context-id"),
  });
  const body = await fetchJson("/api/meetings", {
    method: "POST",
    baseUrl: apiBaseUrl(flags),
    body: payload,
  });

  console.log(JSON.stringify(body, null, 2));
}

async function sendText(flags: Flags): Promise<void> {
  const meetingId = requiredFlag(flags, "meeting-id");
  const payload = ingestTranscriptUtteranceSchema.parse({
    speakerRole: meetingSpeakerRoleSchema.parse(stringFlag(flags, "speaker-role", "OTHER")),
    sourceChannel: meetingSourceChannelSchema.parse(stringFlag(flags, "source-channel", "IMPORTED")),
    text: requiredFlag(flags, "text"),
  });
  const body = await fetchJson(`/api/meetings/${meetingId}/utterances`, {
    method: "POST",
    baseUrl: apiBaseUrl(flags),
    body: payload,
  });

  console.log(JSON.stringify(body, null, 2));
}

async function captureOnce(flags: Flags): Promise<void> {
  const meetingId = requiredFlag(flags, "meeting-id");
  const seconds = numberFlag(flags, "seconds", 8);
  const source = buildCaptureSource({
    flags,
    meetingId,
    baseUrl: apiBaseUrl(flags),
    inputFlag: "input",
    envInput: process.env.MEETING_CAPTURE_FFMPEG_INPUT,
    label: "meeting-audio",
    speakerRole: meetingSpeakerRoleSchema.parse(stringFlag(flags, "speaker-role", "OTHER")),
    sourceChannel: meetingSourceChannelSchema.parse(stringFlag(flags, "source-channel", "LOOPBACK")),
    seconds,
  });

  await captureSourceOnce(source, true);
}

async function captureLoop(flags: Flags): Promise<void> {
  let stopping = false;
  process.once("SIGINT", () => {
    stopping = true;
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });

  while (!stopping) {
    await captureOnce(flags);
  }
}

async function captureLive(flags: Flags): Promise<void> {
  const baseUrl = apiBaseUrl(flags);
  const meetingId = stringFlag(flags, "meeting-id") ?? await createLiveMeetingSession(flags, baseUrl);
  const seconds = numberFlag(flags, "seconds", 6);
  const sources = buildLiveSources(flags, meetingId, baseUrl, seconds);

  if (!sources.length) {
    throw new Error("Provide --mic-input, --meeting-input, or both. Run `devices` to list macOS audio inputs.");
  }

  console.log(`Live capture started for meeting ${meetingId}`);
  console.log(`Open http://localhost:3000/meetings/${meetingId}`);
  console.log("Press Ctrl-C to stop capture.");

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await Promise.all(sources.map((source) => captureSourceLoop(source, () => stopping)));
}

async function createLiveMeetingSession(flags: Flags, baseUrl: string): Promise<string> {
  const payload = createMeetingSessionSchema.parse({
    title: stringFlag(flags, "title", "Live meeting session"),
    platform: meetingPlatformSchema.parse(stringFlag(flags, "platform", "OTHER")),
    externalContextId: stringFlag(flags, "context-id"),
  });
  const body = await fetchJson("/api/meetings", { method: "POST", baseUrl, body: payload });
  const meeting = (body as { meeting?: { id?: unknown } }).meeting;
  if (typeof meeting?.id !== "string") {
    throw new Error("Create meeting response did not include a meeting id.");
  }
  return meeting.id;
}

function buildLiveSources(flags: Flags, meetingId: string, baseUrl: string, seconds: number): CaptureSourceConfig[] {
  const sources: CaptureSourceConfig[] = [];
  const micInput = stringFlag(flags, "mic-input", process.env.MEETING_CAPTURE_MIC_INPUT);
  const meetingInput = stringFlag(flags, "meeting-input", process.env.MEETING_CAPTURE_MEETING_INPUT);

  if (micInput) {
    sources.push(buildCaptureSource({
      flags,
      meetingId,
      baseUrl,
      inputFlag: "mic-input",
      envInput: process.env.MEETING_CAPTURE_MIC_INPUT,
      label: "microphone",
      speakerRole: "SELF",
      sourceChannel: "MIC",
      seconds,
    }));
  }

  if (meetingInput) {
    sources.push(buildCaptureSource({
      flags,
      meetingId,
      baseUrl,
      inputFlag: "meeting-input",
      envInput: process.env.MEETING_CAPTURE_MEETING_INPUT,
      label: "meeting-audio",
      speakerRole: "OTHER",
      sourceChannel: "LOOPBACK",
      seconds,
    }));
  }

  return sources;
}

function buildCaptureSource(input: {
  flags: Flags;
  meetingId: string;
  baseUrl: string;
  inputFlag: string;
  envInput?: string;
  label: string;
  speakerRole: "SELF" | "OTHER" | "UNKNOWN";
  sourceChannel: "MIC" | "LOOPBACK" | "MIXED" | "IMPORTED";
  seconds: number;
}): CaptureSourceConfig {
  const sourceInput = stringFlag(input.flags, input.inputFlag, input.envInput);
  if (!sourceInput) {
    throw new Error(`Missing --${input.inputFlag}. Run \`devices\` to list macOS audio inputs.`);
  }

  const format = stringFlag(
    input.flags,
    "format",
    process.env.MEETING_CAPTURE_FFMPEG_FORMAT ?? (process.platform === "darwin" ? "avfoundation" : undefined),
  );
  if (!format) {
    throw new Error("Missing ffmpeg input format. Pass --format or set MEETING_CAPTURE_FFMPEG_FORMAT.");
  }

  return {
    label: input.label,
    input: sourceInput,
    format,
    speakerRole: input.speakerRole,
    sourceChannel: input.sourceChannel,
    seconds: input.seconds,
    baseUrl: input.baseUrl,
    meetingId: input.meetingId,
  };
}

async function captureSourceLoop(source: CaptureSourceConfig, shouldStop: () => boolean): Promise<void> {
  while (!shouldStop()) {
    await captureSourceOnce(source, false);
  }
}

async function captureSourceOnce(source: CaptureSourceConfig, printJson: boolean): Promise<void> {
  const audioPath = await recordAudioChunk(source);

  try {
    if (await isSilentChunk(audioPath)) {
      console.log(`[${source.label}] silent; skipped`);
      return;
    }

    const text = normalizeTranscription(await transcribeAudio(audioPath));
    if (!text) {
      console.log(`[${source.label}] no speech; skipped`);
      return;
    }

    const payload = ingestTranscriptUtteranceSchema.parse({
      speakerRole: source.speakerRole,
      sourceChannel: source.sourceChannel,
      text,
      engineMetadata: { captureSeconds: source.seconds, captureSource: source.label },
    });
    const body = await fetchJson(`/api/meetings/${source.meetingId}/utterances`, {
      method: "POST",
      baseUrl: source.baseUrl,
      body: payload,
    });

    if (printJson) {
      console.log(JSON.stringify(body, null, 2));
    } else {
      console.log(`[${source.label}] ${text}`);
    }
  } finally {
    await rm(audioPath, { force: true });
  }
}

async function recordAudioChunk(source: CaptureSourceConfig): Promise<string> {
  const captureDir = join(tmpdir(), "meeting-capture");
  await mkdir(captureDir, { recursive: true });
  const audioPath = join(captureDir, `${randomUUID()}.wav`);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    source.format,
    "-i",
    source.input,
    "-t",
    String(source.seconds),
    "-ac",
    "1",
    "-ar",
    "16000",
    audioPath,
  ]);

  return audioPath;
}

async function transcribeAudio(audioPath: string): Promise<string> {
  const command = transcribeCommandName();
  const args = parseTranscribeArgs(audioPath);
  const result = await run(command, args);
  return result.stdout.trim();
}

function silenceThresholdDb(): number {
  const parsed = Number(process.env.MEETING_CAPTURE_SILENCE_MAX_DB);
  return Number.isFinite(parsed) ? parsed : -45;
}

async function isSilentChunk(audioPath: string): Promise<boolean> {
  const result = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", audioPath, "-af", "volumedetect", "-f", "null", "-"], {
    allowFailure: true,
  });
  const match = result.stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  if (!match) {
    return false;
  }
  const maxDb = Number(match[1]);
  return Number.isFinite(maxDb) && maxDb <= silenceThresholdDb();
}

function transcribeCommandName(): string {
  return process.env.MEETING_CAPTURE_TRANSCRIBE_COMMAND ?? "whisper-cli";
}

function normalizeTranscription(text: string): string {
  return text
    .replaceAll(/\[[^\]]*\]/g, " ")
    .replaceAll(/\([^)]*\)/g, " ")
    .replaceAll(/\*[^*]*\*/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function parseTranscribeArgs(audioPath: string): string[] {
  const raw = process.env.MEETING_CAPTURE_TRANSCRIBE_ARGS;
  if (!raw) {
    return ["-m", defaultWhisperModelPath(), "-f", audioPath, "-nt", "-np"];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("MEETING_CAPTURE_TRANSCRIBE_ARGS must be a JSON array of strings.");
  }

  return parsed.map((item) => item.replaceAll("{audio}", audioPath));
}

function defaultWhisperModelPath(): string {
  return process.env.MEETING_CAPTURE_WHISPER_MODEL
    ?? join(homedir(), ".cache", "teams-discovery-observer", "models", "ggml-tiny.en.bin");
}

async function fetchJson(
  path: string,
  options: { method: "GET" | "POST"; baseUrl: string; body?: unknown },
): Promise<unknown> {
  const response = await fetch(new URL(path, options.baseUrl), {
    method: options.method,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${bodyText}`);
  }

  return bodyText ? JSON.parse(bodyText) : {};
}

function run(command: string, args: string[], options: { allowFailure?: boolean } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (options.allowFailure) {
        resolve({ stdout, stderr: stderr || error.message, code: 1 });
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0 && !options.allowFailure) {
        reject(new Error(`${command} exited with ${code}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

function printHelp(): void {
  console.log(`Provider-agnostic local meeting capture companion

Commands:
  check --api-base http://localhost:3000
  devices
  create-session --title "Client call" --platform OTHER
  send-text --meeting-id <id> --text "Can you explain the next step?" --speaker-role OTHER --source-channel IMPORTED
  capture-once --meeting-id <id> --seconds 8 --input ":BlackHole 2ch"
  capture-loop --meeting-id <id> --seconds 8 --input ":BlackHole 2ch"
  capture-live --title "Client call" --platform BROWSER --mic-input ":2" --meeting-input ":0" --seconds 6

macOS avfoundation input format:
  ":2" captures audio device index 2 with no video.
  Run the devices command to find microphone and loopback indexes.

Environment:
  MEETING_ASSISTANT_API_BASE_URL=http://localhost:3000
  MEETING_CAPTURE_FFMPEG_FORMAT=avfoundation
  MEETING_CAPTURE_MIC_INPUT=":2"
  MEETING_CAPTURE_MEETING_INPUT=":0"
  MEETING_CAPTURE_TRANSCRIBE_COMMAND=whisper-cli
  MEETING_CAPTURE_WHISPER_MODEL="$HOME/.cache/teams-discovery-observer/models/ggml-tiny.en.bin"
  MEETING_CAPTURE_TRANSCRIBE_ARGS='["-m","/path/to/model.bin","-f","{audio}","-nt","-np"]'
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
