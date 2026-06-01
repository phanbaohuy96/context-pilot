import { describe, expect, it } from "vitest";
import {
  closedMergeCandidates,
  detectMeetingAssistInsights,
  endsWithTerminalPunctuation,
  groupMergeableUtterances,
  isLikelyHallucinatedTranscription,
  meanTokenConfidence,
  type MergeCandidate,
} from "./meetings";

describe("transcription confidence", () => {
  it("averages real token probabilities and ignores whisper special tokens", () => {
    const segments = [
      { tokens: [{ text: " Hi", p: 0.9 }, { text: "[_BEG_]", p: 0.1 }, { text: " there", p: 0.7 }] },
    ];
    // 0.1 from the "[...]" special token must not drag the mean down.
    expect(meanTokenConfidence(segments)).toBeCloseTo(0.8);
  });

  it("returns undefined when there are no real tokens (fail-soft, not 0)", () => {
    expect(meanTokenConfidence([])).toBeUndefined();
    expect(meanTokenConfidence([{ tokens: [{ text: "[_TT_0]", p: 0.5 }] }])).toBeUndefined();
    expect(meanTokenConfidence([{}])).toBeUndefined();
  });

  it("clamps out-of-range probabilities into [0,1]", () => {
    expect(meanTokenConfidence([{ tokens: [{ text: "a", p: 1.5 }] }])).toBe(1);
    expect(meanTokenConfidence([{ tokens: [{ text: "a", p: -0.2 }] }])).toBe(0);
  });
});

describe("transcription noise filtering", () => {
  it("flags Whisper silence-hallucination phrases regardless of punctuation/case", () => {
    // A quiet mic produced these in a real capture; they carry no speech.
    expect(isLikelyHallucinatedTranscription("Thank you.")).toBe(true);
    expect(isLikelyHallucinatedTranscription("you")).toBe(true);
    expect(isLikelyHallucinatedTranscription("Thanks for watching")).toBe(true);
  });

  it("flags symbol-only output such as Whisper music markers", () => {
    expect(isLikelyHallucinatedTranscription("♪♪ ♪♪")).toBe(true);
    expect(isLikelyHallucinatedTranscription("...")).toBe(true);
  });

  it("keeps real speech even when it contains a stock phrase as a substring", () => {
    expect(isLikelyHallucinatedTranscription("Thank you all for the detailed update on the rollout.")).toBe(false);
    expect(isLikelyHallucinatedTranscription("Cool, well said.")).toBe(false);
  });
});

describe("meeting assist insight detection", () => {
  it("detects questions from other speakers and suggests a short reply", () => {
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_1",
      speakerRole: "OTHER",
      text: "Can you explain the next step for the delivery timeline?",
    });

    expect(insights.map((insight) => insight.kind)).toEqual(["QUESTION_FOR_YOU", "ANSWER_SUGGESTION"]);
    expect(insights[0].relatedUtteranceIds).toEqual(["utt_1"]);
    expect(insights[1].text).toContain("Reply idea");
  });

  it("surfaces only the question sentence from a multi-sentence utterance", () => {
    // The whole utterance must NOT become the card body — only the actual question.
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_q",
      speakerRole: "OTHER",
      text: "We shipped the rollout yesterday. Are you comfortable with the timeline? I think it looks fine.",
    });

    const question = insights.find((insight) => insight.kind === "QUESTION_FOR_YOU");
    expect(question?.text).toBe("Possible question for you: Are you comfortable with the timeline?");
    expect(question?.text).not.toContain("rollout yesterday");
  });

  it("detects likely action items", () => {
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_2",
      speakerRole: "OTHER",
      text: "Please confirm the launch checklist after this call.",
    });

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ kind: "ACTION_ITEM", relatedUtteranceIds: ["utt_2"] });
  });

  it("surfaces only the action sentence from a multi-sentence utterance", () => {
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_a",
      speakerRole: "OTHER",
      text: "Thanks for the demo. Please review the launch checklist before Friday. It was great work.",
    });

    const action = insights.find((insight) => insight.kind === "ACTION_ITEM");
    expect(action?.text).toBe("Likely action item: Please review the launch checklist before Friday.");
    expect(action?.text).not.toContain("great work");
  });

  it("does not split sentences on decimals or abbreviations in transcribed speech", () => {
    // Version numbers / abbreviations are common in technical meetings; the matched
    // clause must survive intact rather than truncate at "v1.".
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_v",
      speakerRole: "OTHER",
      text: "Please review the v1.5 spec for the U.S. launch before Friday. Thanks.",
    });

    const action = insights.find((insight) => insight.kind === "ACTION_ITEM");
    expect(action?.text).toBe("Likely action item: Please review the v1.5 spec for the U.S. launch before Friday.");
  });

  it("drops filler words and ranks keywords by frequency", () => {
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_k",
      speakerRole: "OTHER",
      text: "Please review the migration plan, the migration window, and basically the migration owner before launch.",
    });

    const action = insights.find((insight) => insight.kind === "ACTION_ITEM");
    // "migration" repeats three times, so it ranks first ahead of one-off terms.
    expect(action?.keywords[0]).toBe("migration");
    // Filler now excluded by the expanded stop list ("basically"/"before" were not in
    // the original 16-word list); topical terms survive.
    expect(action?.keywords).not.toContain("basically");
    expect(action?.keywords).not.toContain("before");
    expect(action?.keywords).toContain("owner");
  });

  it("detects configured name mentions", () => {
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_3",
      speakerRole: "OTHER",
      text: "Alex, can you review this risk?",
      userName: "Alex",
    });

    expect(insights.map((insight) => insight.kind)).toContain("NAME_MENTION");
  });

  it("ignores self utterances", () => {
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_4",
      speakerRole: "SELF",
      text: "Can you explain the next step?",
    });

    expect(insights).toEqual([]);
  });
});

describe("endsWithTerminalPunctuation", () => {
  it("treats sentence-final punctuation (with trailing quotes) as complete", () => {
    expect(endsWithTerminalPunctuation("All done.")).toBe(true);
    expect(endsWithTerminalPunctuation("Really?")).toBe(true);
    expect(endsWithTerminalPunctuation('He said "go."')).toBe(true);
  });

  it("treats a cut-off clause as incomplete", () => {
    expect(endsWithTerminalPunctuation("so I was thinking")).toBe(false);
    expect(endsWithTerminalPunctuation("the number is 3,000 and")).toBe(false);
  });
});

describe("groupMergeableUtterances", () => {
  const base = (over: Omit<Partial<MergeCandidate>, "startedAt"> & { id: string; startedAt: number; text: string }): MergeCandidate => ({
    speakerRole: "OTHER",
    sourceChannel: "LOOPBACK",
    endedAt: new Date(over.startedAt + 1000),
    engineMetadata: {},
    ...over,
    startedAt: new Date(over.startedAt),
  });

  it("groups consecutive same-speaker fragments split mid-sentence", () => {
    const groups = groupMergeableUtterances([
      base({ id: "a", startedAt: 0, text: "so I was thinking we should" }),
      base({ id: "b", startedAt: 1500, text: "move the deadline to Friday." }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member) => member.id)).toEqual(["a", "b"]);
  });

  it("does not group after a sentence that ends cleanly", () => {
    const groups = groupMergeableUtterances([
      base({ id: "a", startedAt: 0, text: "That works for me." }),
      base({ id: "b", startedAt: 1500, text: "Anything else to cover?" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("does not group across a large pause, speaker, or channel change", () => {
    const bigGap = groupMergeableUtterances([
      base({ id: "a", startedAt: 0, text: "I was about to" }),
      base({ id: "b", startedAt: 9000, text: "say something else" }),
    ]);
    expect(bigGap).toEqual([]);

    const otherSpeaker = groupMergeableUtterances([
      base({ id: "a", startedAt: 0, text: "I was about to", engineMetadata: { speakerKey: 1 } }),
      base({ id: "b", startedAt: 1500, text: "say something else", engineMetadata: { speakerKey: 2 } }),
    ]);
    expect(otherSpeaker).toEqual([]);

    const otherChannel = groupMergeableUtterances([
      base({ id: "a", startedAt: 0, text: "I was about to", sourceChannel: "MIC" }),
      base({ id: "b", startedAt: 1500, text: "say something else", sourceChannel: "LOOPBACK" }),
    ]);
    expect(otherChannel).toEqual([]);
  });

  it("ignores interim, already-merged, already-superseded, and empty rows", () => {
    const groups = groupMergeableUtterances([
      base({ id: "interim", startedAt: 0, text: "draft text", engineMetadata: { interim: true } }),
      base({ id: "a", startedAt: 1000, text: "we need to" }),
      base({ id: "superseded", startedAt: 1200, text: "old fragment", engineMetadata: { supersededBy: "x" } }),
      base({ id: "b", startedAt: 2000, text: "finish the report" }),
      base({ id: "merged", startedAt: 2200, text: "we need to finish the report", engineMetadata: { merged: true, sourceUtteranceIds: ["a", "b"] } }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member) => member.id)).toEqual(["a", "b"]);
  });
});

describe("closedMergeCandidates", () => {
  const base = (over: Omit<Partial<MergeCandidate>, "startedAt"> & { id: string; startedAt: number; text: string }): MergeCandidate => ({
    speakerRole: "OTHER",
    sourceChannel: "LOOPBACK",
    endedAt: new Date(over.startedAt + 1000),
    engineMetadata: {},
    ...over,
    startedAt: new Date(over.startedAt),
  });

  it("withholds a single speaker's still-open turn (no boundary has closed it yet)", () => {
    // Same speaker, small gaps: the turn could still continue, so nothing is closed yet —
    // the end-of-meeting final pass handles a monologue instead of the live pass.
    const candidates = closedMergeCandidates([
      base({ id: "a", startedAt: 0, text: "so I was thinking we should" }),
      base({ id: "b", startedAt: 1500, text: "probably move the" }),
    ]);
    expect(candidates).toEqual([]);
  });

  it("closes the prior turn once a different speaker takes over", () => {
    const candidates = closedMergeCandidates([
      base({ id: "a", startedAt: 0, text: "so I was thinking we should", engineMetadata: { speakerKey: 1 } }),
      base({ id: "b", startedAt: 1500, text: "probably move the", engineMetadata: { speakerKey: 1 } }),
      base({ id: "c", startedAt: 3500, text: "Sounds good to me.", engineMetadata: { speakerKey: 2 } }),
    ]);
    // a+b are closed by speaker 2 starting; c is the open trailing turn and is withheld.
    expect(candidates.map((candidate) => candidate.id)).toEqual(["a", "b"]);
  });

  it("closes a turn when the same speaker resumes after a long pause", () => {
    const candidates = closedMergeCandidates([
      base({ id: "a", startedAt: 0, text: "so I was thinking we should" }),
      base({ id: "b", startedAt: 1500, text: "move the deadline" }),
      base({ id: "c", startedAt: 12000, text: "and also revisit scope" }),
    ]);
    // The >2.5s gap before c closes a+b; c becomes the open trailing turn.
    expect(candidates.map((candidate) => candidate.id)).toEqual(["a", "b"]);
  });

  it("closes all but the last fragment of an over-long open run (solo monologue)", () => {
    // A continuous same-speaker run with no pause, speaker change, or terminal punctuation
    // would otherwise never close live. Past MERGE_MAX_OPEN_RUN (6) fragments, every fragment
    // except the most recent (which may still continue) becomes a live merge candidate.
    const rows = Array.from({ length: 8 }, (_, index) =>
      base({ id: `f${index}`, startedAt: index * 1500, text: `fragment ${index} keeps going` }),
    );
    const candidates = closedMergeCandidates(rows);
    expect(candidates.map((candidate) => candidate.id)).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f6"]);
  });
});
