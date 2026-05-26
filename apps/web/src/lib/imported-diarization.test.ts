import { describe, expect, it } from "vitest";
import { importedMediaFileName, importedUtteranceSpanSeconds } from "./imported-diarization";

const meetingStartedAt = new Date("2026-05-26T12:00:00.000Z");

function utterance(overrides: Partial<Parameters<typeof importedUtteranceSpanSeconds>[1]> = {}): Parameters<typeof importedUtteranceSpanSeconds>[1] {
  return {
    id: "utt-1",
    startedAt: new Date("2026-05-26T12:00:03.000Z"),
    endedAt: new Date("2026-05-26T12:00:05.000Z"),
    engineMetadata: null,
    speakerRole: "OTHER",
    sourceChannel: "IMPORTED",
    ...overrides,
  };
}

describe("importedMediaFileName", () => {
  it("accepts a local media file name", () => {
    expect(importedMediaFileName(" test-meeting.mp4 ")).toBe("test-meeting.mp4");
    expect(importedMediaFileName("meeting-audio.WAV")).toBe("meeting-audio.WAV");
  });

  it("rejects missing values, paths, and unsupported extensions", () => {
    expect(importedMediaFileName(undefined)).toBeNull();
    expect(importedMediaFileName("")).toBeNull();
    expect(importedMediaFileName("../test-meeting.mp4")).toBeNull();
    expect(importedMediaFileName("nested/test-meeting.mp4")).toBeNull();
    expect(importedMediaFileName("transcript.txt")).toBeNull();
  });
});

describe("importedUtteranceSpanSeconds", () => {
  it("returns an audio span for imported remote transcript lines", () => {
    expect(importedUtteranceSpanSeconds(meetingStartedAt, utterance())).toEqual({ start: 3, duration: 2 });
  });

  it("rejects live loopback rows and non-remote rows", () => {
    expect(importedUtteranceSpanSeconds(meetingStartedAt, utterance({ sourceChannel: "LOOPBACK" }))).toBeNull();
    expect(importedUtteranceSpanSeconds(meetingStartedAt, utterance({ speakerRole: "SELF" }))).toBeNull();
  });

  it("rejects unfinished and too-short rows", () => {
    expect(importedUtteranceSpanSeconds(meetingStartedAt, utterance({ endedAt: null }))).toBeNull();
    expect(importedUtteranceSpanSeconds(meetingStartedAt, utterance({ endedAt: new Date("2026-05-26T12:00:04.000Z") }))).toBeNull();
  });
});
