import { describe, expect, it } from "vitest";
import { ASSIST_LABEL_PREFIXES, assistInsightDisplayText } from "./assist-display";
import { detectMeetingAssistInsights } from "./meetings";

describe("assistInsightDisplayText", () => {
  it("strips the detector's label prefix for each kind", () => {
    expect(assistInsightDisplayText("QUESTION_FOR_YOU", "Possible question for you: How are we doing?"))
      .toBe("How are we doing?");
    expect(assistInsightDisplayText("ACTION_ITEM", "Likely action item: Send the report."))
      .toBe("Send the report.");
    expect(assistInsightDisplayText("NAME_MENTION", "Your name was mentioned: Alex, thoughts?"))
      .toBe("Alex, thoughts?");
    expect(assistInsightDisplayText("ANSWER_SUGGESTION", "Reply idea: acknowledge then answer."))
      .toBe("acknowledge then answer.");
  });

  it("returns the trimmed text unchanged for kinds with no label (e.g. NOTE)", () => {
    expect(assistInsightDisplayText("NOTE", "  just a note  ")).toBe("just a note");
  });

  it("round-trips with what the detector mints, so the translation cache key is stable", () => {
    // The detector and the stripper share ASSIST_LABEL_PREFIXES; whatever is minted must
    // strip cleanly back to the bare content (no leftover label), or the client/server
    // translation hashes diverge.
    const insights = detectMeetingAssistInsights({
      utteranceId: "u1",
      speakerRole: "OTHER",
      text: "Are you comfortable with the timeline?",
      userName: "Alex",
    });
    for (const insight of insights) {
      const display = assistInsightDisplayText(insight.kind, insight.text);
      const prefix = ASSIST_LABEL_PREFIXES[insight.kind];
      if (prefix) {
        expect(insight.text.startsWith(prefix)).toBe(true);
        expect(display.startsWith(prefix)).toBe(false);
      }
      expect(display.length).toBeGreaterThan(0);
    }
  });
});
