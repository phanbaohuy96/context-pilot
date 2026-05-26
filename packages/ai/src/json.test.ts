import { describe, expect, it } from "vitest";
import { parseMeetingNotes } from "./json";

describe("parseMeetingNotes", () => {
  it("parses a plain JSON object", () => {
    const notes = parseMeetingNotes('{"summary":"We discussed the rollout.","openQuestions":["When do we ship?"],"actionItems":["Alex: prepare the checklist"]}');
    expect(notes.summary).toBe("We discussed the rollout.");
    expect(notes.openQuestions).toEqual(["When do we ship?"]);
    expect(notes.actionItems).toEqual(["Alex: prepare the checklist"]);
  });

  it("tolerates code fences and surrounding prose from the model", () => {
    const raw = "Here are the notes:\n```json\n{\"summary\":\"Done.\",\"openQuestions\":[],\"actionItems\":[]}\n```\nHope that helps!";
    expect(parseMeetingNotes(raw).summary).toBe("Done.");
  });

  it("defaults missing arrays so a partial object still parses", () => {
    const notes = parseMeetingNotes('{"summary":"Just a summary."}');
    expect(notes.openQuestions).toEqual([]);
    expect(notes.actionItems).toEqual([]);
  });

  it("returns an empty result when there is no JSON object", () => {
    expect(parseMeetingNotes("I could not produce notes.")).toEqual({
      summary: "",
      openQuestions: [],
      actionItems: [],
    });
  });
});
