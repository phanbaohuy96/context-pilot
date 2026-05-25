import { describe, expect, it } from "vitest";
import { detectMeetingAssistInsights } from "./meetings";

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

  it("detects likely action items", () => {
    const insights = detectMeetingAssistInsights({
      utteranceId: "utt_2",
      speakerRole: "OTHER",
      text: "Please confirm the launch checklist after this call.",
    });

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ kind: "ACTION_ITEM", relatedUtteranceIds: ["utt_2"] });
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
