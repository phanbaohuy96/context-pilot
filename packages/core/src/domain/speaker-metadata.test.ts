import { describe, expect, it } from "vitest";
import {
  metadataWithDiarizedSpeaker,
  metadataWithSpeakerAlias,
  speakerAliasFromMetadata,
  speakerKeyFromMetadata,
  speakerLabelFromMetadata,
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
