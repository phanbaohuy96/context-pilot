import { describe, expect, it } from "vitest";
import { detectMeetingAssistInsights, isLikelyHallucinatedTranscription } from "./meetings";

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
