import { describe, expect, it } from "vitest";
import {
  hashTranscriptText,
  isInterimMetadata,
  mergedSourceIdsFromMetadata,
  metadataAsMerged,
  metadataWithDiarizedSpeaker,
  metadataWithSpeakerAlias,
  metadataWithSupersededBy,
  metadataWithTranslation,
  speakerAliasFromMetadata,
  speakerKeyFromMetadata,
  speakerLabelFromMetadata,
  supersededByFromMetadata,
  translationFromMetadata,
} from "./speaker-metadata";

describe("speaker metadata", () => {
  it("accepts positive integer speaker keys only", () => {
    expect(speakerKeyFromMetadata({ speakerKey: 1 })).toBe(1);
    expect(speakerKeyFromMetadata({ speakerKey: 0 })).toBeUndefined();
    expect(speakerKeyFromMetadata({ speakerKey: 1.5 })).toBeUndefined();
    expect(speakerKeyFromMetadata({ speakerKey: "1" })).toBeUndefined();
    expect(speakerKeyFromMetadata(null)).toBeUndefined();
  });

  it("trims labels and aliases from JSON metadata", () => {
    expect(speakerLabelFromMetadata({ speakerLabel: " Speaker 2 " })).toBe("Speaker 2");
    expect(speakerAliasFromMetadata({ speakerAlias: " Alice " })).toBe("Alice");
    expect(speakerLabelFromMetadata({ speakerLabel: " " })).toBeUndefined();
    expect(speakerAliasFromMetadata({ speakerAlias: 42 })).toBeUndefined();
  });

  it("adds or removes aliases without dropping existing diarization metadata", () => {
    expect(metadataWithSpeakerAlias({ speakerKey: 1, speakerLabel: "Speaker 1" }, " Alice ")).toEqual({
      speakerKey: 1,
      speakerLabel: "Speaker 1",
      speakerAlias: "Alice",
    });
    expect(metadataWithSpeakerAlias({ speakerKey: 1, speakerLabel: "Speaker 1", speakerAlias: "Alice" }, " ")).toEqual({
      speakerKey: 1,
      speakerLabel: "Speaker 1",
    });
  });

  it("stamps real diarization metadata and clears stale aliases from undiarized rows", () => {
    expect(metadataWithDiarizedSpeaker({ captureSource: "meeting-audio", speakerAlias: "Eric" }, 2, "Speaker 2")).toEqual({
      captureSource: "meeting-audio",
      speakerKey: 2,
      speakerLabel: "Speaker 2",
    });
    expect(metadataWithDiarizedSpeaker({ speakerKey: 2, speakerLabel: "Speaker 2", speakerAlias: "Eric" }, 2, "Speaker 2")).toEqual({
      speakerKey: 2,
      speakerLabel: "Speaker 2",
      speakerAlias: "Eric",
    });
  });
});

describe("merge metadata", () => {
  it("reads the interim flag only when strictly true", () => {
    expect(isInterimMetadata({ interim: true })).toBe(true);
    expect(isInterimMetadata({ interim: false })).toBe(false);
    expect(isInterimMetadata({})).toBe(false);
    expect(isInterimMetadata(null)).toBe(false);
  });

  it("flags a merged row and records its source fragments", () => {
    const merged = metadataAsMerged({ speakerKey: 1 }, ["a", "b"]);
    expect(merged).toEqual({ speakerKey: 1, merged: true, sourceUtteranceIds: ["a", "b"] });
    expect(mergedSourceIdsFromMetadata(merged)).toEqual(["a", "b"]);
  });

  it("returns merged source ids only for non-empty string arrays", () => {
    expect(mergedSourceIdsFromMetadata({ sourceUtteranceIds: [] })).toBeUndefined();
    expect(mergedSourceIdsFromMetadata({ sourceUtteranceIds: [1, 2] })).toBeUndefined();
    expect(mergedSourceIdsFromMetadata({})).toBeUndefined();
  });

  it("marks a fragment superseded without dropping existing metadata", () => {
    const superseded = metadataWithSupersededBy({ captureSource: "mic", frames: 4 }, "merged-1");
    expect(superseded).toEqual({ captureSource: "mic", frames: 4, supersededBy: "merged-1" });
    expect(supersededByFromMetadata(superseded)).toBe("merged-1");
    expect(supersededByFromMetadata({})).toBeUndefined();
  });
});

describe("translation metadata", () => {
  it("hashes text deterministically and changes when the text changes", () => {
    expect(hashTranscriptText("hello world")).toBe(hashTranscriptText("hello world"));
    expect(hashTranscriptText("hello world")).not.toBe(hashTranscriptText("hello world."));
  });

  it("round-trips a stored translation", () => {
    const translation = { lang: "vi", text: "xin chào", sourceHash: hashTranscriptText("hello") };
    const meta = metadataWithTranslation({ speakerKey: 1 }, translation);
    expect(meta.speakerKey).toBe(1);
    expect(translationFromMetadata(meta)).toEqual(translation);
  });

  it("returns undefined for a malformed or missing translation", () => {
    expect(translationFromMetadata({})).toBeUndefined();
    expect(translationFromMetadata({ translation: { lang: "vi" } })).toBeUndefined();
    expect(translationFromMetadata(null)).toBeUndefined();
  });
});
