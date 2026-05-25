import { spawn } from "node:child_process";

export type AudioDevice = { index: string; name: string };

function ffmpegFormat(): string {
  return process.env.MEETING_CAPTURE_FFMPEG_FORMAT ?? "avfoundation";
}

function parseAudioDevices(output: string): AudioDevice[] {
  const devices: AudioDevice[] = [];
  let inAudioSection = false;

  for (const line of output.split("\n")) {
    if (/AVFoundation audio devices:/.test(line)) {
      inAudioSection = true;
      continue;
    }
    if (/AVFoundation video devices:/.test(line)) {
      inAudioSection = false;
      continue;
    }
    if (!inAudioSection) {
      continue;
    }

    const match = line.match(/\[(\d+)\]\s+(.+?)\s*$/);
    if (match) {
      devices.push({ index: `:${match[1]}`, name: match[2].trim() });
    }
  }

  return devices;
}

export function listAudioDevices(): Promise<AudioDevice[]> {
  if (process.platform !== "darwin") {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-f", ffmpegFormat(), "-list_devices", "true", "-i", ""], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve([]));
    child.on("close", () => resolve(parseAudioDevices(output)));
  });
}
