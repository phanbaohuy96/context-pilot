import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Voice-embedding extraction for speaker diarization. Wraps a local ONNX speaker
// model (wavlm-base-plus-sv) run through transformers.js / onnxruntime. The model is
// loaded once and downloaded to the project cache on first use. Pure clustering of
// the embeddings it returns lives in @context-pilot/core.

type XVectorProcessor = (audio: Float32Array) => Promise<Record<string, unknown>>;
type XVectorModel = (inputs: Record<string, unknown>) => Promise<{ embeddings: { tolist(): number[][] } }>;

function modelId(): string {
  return process.env.MEETING_DIARIZATION_MODEL ?? "Xenova/wavlm-base-plus-sv";
}

export function speakerSimilarityThreshold(fallback: number): number {
  const parsed = Number(process.env.MEETING_DIARIZATION_SIMILARITY_THRESHOLD);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Decodes a 16-bit PCM mono WAV (what the capture pipeline produces) to a normalized
// Float32Array, locating the `data` chunk rather than assuming a fixed header size.
function decodePcm16Wav(buffer: Buffer): Float32Array {
  let offset = 12; // skip RIFF header + "WAVE"
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === "data") {
      // Clamp to bytes actually present: a capture killed mid-write (e.g. on stop)
      // can leave the header's chunkSize larger than the file, which would otherwise
      // read past the buffer.
      const available = Math.max(0, buffer.length - body);
      const sampleCount = Math.floor(Math.min(chunkSize, available) / 2);
      const samples = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        samples[i] = buffer.readInt16LE(body + i * 2) / 32768;
      }
      return samples;
    }
    offset = body + chunkSize + (chunkSize % 2);
  }
  throw new Error("WAV has no data chunk");
}

let loader: Promise<{ processor: XVectorProcessor; model: XVectorModel } | null> | undefined;

async function load(): Promise<{ processor: XVectorProcessor; model: XVectorModel } | null> {
  if (!loader) {
    loader = (async () => {
      // Imported lazily so the heavy native runtime only loads when diarization runs.
      const { AutoProcessor, AutoModelForXVector, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.MEETING_DIARIZATION_MODEL_CACHE
        ?? join(homedir(), ".cache", "context-pilot", "models", "transformers");
      const processor = (await AutoProcessor.from_pretrained(modelId())) as unknown as XVectorProcessor;
      const model = (await AutoModelForXVector.from_pretrained(modelId())) as unknown as XVectorModel;
      return { processor, model };
    })().catch((error) => {
      // Reset so a later capture can retry, and surface the cause to the caller.
      loader = undefined;
      throw error;
    });
  }
  return loader;
}

// Kicks off the model load in the background. Called at capture start (only for the
// channel that diarizes) so the cold download/init happens while the first utterances
// accumulate, rather than stalling the first finalize. Errors are deferred to the real call.
export function warmupDiarizer(): void {
  void load().catch(() => undefined);
}

// Returns a 512-d speaker embedding for the utterance audio. Callers decide whether to
// diarize (the capture runner only calls this on its diarizing channel; imported diarization
// always does), so this no longer self-gates. Throws if the model fails to load/run, so the
// caller can record the error and continue without a speaker label.
export async function embedSpeaker(wavPath: string): Promise<number[] | null> {
  const loaded = await load();
  if (!loaded) {
    return null;
  }
  const audio = decodePcm16Wav(await readFile(wavPath));
  const inputs = await loaded.processor(audio);
  const { embeddings } = await loaded.model(inputs);
  return embeddings.tolist()[0];
}
