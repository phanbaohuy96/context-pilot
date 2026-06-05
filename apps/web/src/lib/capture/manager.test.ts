import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertWhisperModelAvailable } from "./manager";

describe("assertWhisperModelAvailable", () => {
  it("accepts an existing model file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "meeting-capture-test-"));
    const modelPath = join(dir, "ggml-tiny.en.bin");
    try {
      await writeFile(modelPath, "model");

      await expect(assertWhisperModelAvailable(modelPath)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a missing model with setup guidance", async () => {
    await expect(assertWhisperModelAvailable("/tmp/context-pilot-missing-model.bin"))
      .rejects
      .toThrow("Put a whisper.cpp GGML model there or set MEETING_CAPTURE_WHISPER_MODEL");
  });
});
