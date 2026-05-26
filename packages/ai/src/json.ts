import {
  meetingNotesSchema,
  requirementExtractionSchema,
  type MeetingNotes,
  type RequirementExtraction,
} from "@teams-observer/core";

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
