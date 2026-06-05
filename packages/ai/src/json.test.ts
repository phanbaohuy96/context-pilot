import { describe, expect, it } from "vitest";
import { parseMeetingContext, parseMeetingNotes, parseTranscriptCorrection, parseTranslation } from "./json";

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

describe("parseMeetingContext", () => {
  it("parses prepared meeting context JSON", () => {
    const context = parseMeetingContext('{"briefing":"Discuss launch.","agendaItems":["Review launch"],"openQuestions":["Who owns rollout?"],"risks":["Late QA"],"keywords":["launch","qa"]}');
    expect(context).toEqual({
      briefing: "Discuss launch.",
      agendaItems: ["Review launch"],
      openQuestions: ["Who owns rollout?"],
      risks: ["Late QA"],
      keywords: ["launch", "qa"],
    });
  });

  it("defaults missing arrays and tolerates no JSON", () => {
    expect(parseMeetingContext('{"briefing":"Only context."}')).toEqual({
      briefing: "Only context.",
      agendaItems: [],
      openQuestions: [],
      risks: [],
      keywords: [],
    });
    expect(parseMeetingContext("no context")).toEqual({
      briefing: "",
      agendaItems: [],
      openQuestions: [],
      risks: [],
      keywords: [],
    });
  });
});

describe("parseTranscriptCorrection / parseTranslation", () => {
  it("reads the text field from a JSON object", () => {
    expect(parseTranscriptCorrection('{"text":"We should move the deadline to Friday."}').text).toBe(
      "We should move the deadline to Friday.",
    );
    expect(parseTranslation('{"text":"Xin chào"}').text).toBe("Xin chào");
  });

  it("tolerates code fences around the JSON", () => {
    expect(parseTranslation('```json\n{"text":"Xin chào"}\n```').text).toBe("Xin chào");
  });

  it("falls back to the raw output when the model replied in plain text", () => {
    expect(parseTranscriptCorrection("We should move the deadline to Friday.").text).toBe(
      "We should move the deadline to Friday.",
    );
  });

  it("returns empty (not the literal JSON) when a well-formed object has an empty text field", () => {
    // Regression: an empty `text` must NOT fall through to the raw output, or the literal
    // `{"text":""}` would be written into the transcript / shown as the translation.
    expect(parseTranscriptCorrection('{"text":""}').text).toBe("");
    expect(parseTranslation('{"text":"   "}').text).toBe("");
  });
});
