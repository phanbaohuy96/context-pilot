import {
  meetingNotesSchema,
  preparedMeetingContextSchema,
  requirementExtractionSchema,
  type MeetingNotes,
  type PreparedMeetingContext,
  type RequirementExtraction,
} from "@context-pilot/core";

// Pulls a JSON object out of an LLM response (tolerating ``` fences and surrounding
// prose): the slice between the first `{` and last `}`, or null when there is none.
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    return null;
  }
  return candidate.slice(firstBrace, lastBrace + 1);
}

export function parseRequirementExtraction(text: string): RequirementExtraction {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return { requirements: [] };
  }
  return requirementExtractionSchema.parse(JSON.parse(candidate));
}

export function parseMeetingNotes(text: string): MeetingNotes {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return { summary: "", openQuestions: [], actionItems: [] };
  }
  return meetingNotesSchema.parse(JSON.parse(candidate));
}

export function parseMeetingContext(text: string): PreparedMeetingContext {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return { briefing: "", agendaItems: [], openQuestions: [], risks: [], keywords: [] };
  }
  return preparedMeetingContextSchema.parse(JSON.parse(candidate));
}

// Reads the `text` field from a {"text":"..."} response, tolerating a model that
// replied in plain text instead of JSON (fall back to the raw output). A well-formed
// object with an empty `text` returns "" — it must NOT fall through to the raw output,
// or the literal JSON (e.g. `{"text":""}`) would leak into the transcript/translation.
function parseTextField(raw: string): string {
  const candidate = extractJsonObject(raw);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as { text?: unknown };
      if (typeof parsed.text === "string") {
        return parsed.text.trim();
      }
    } catch {
      // Malformed JSON — fall through to the plain-text fallback below.
    }
  }
  return raw.trim();
}

export function parseTranscriptCorrection(text: string): { text: string } {
  return { text: parseTextField(text) };
}

export function parseTranslation(text: string): { text: string } {
  return { text: parseTextField(text) };
}
