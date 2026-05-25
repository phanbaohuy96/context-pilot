import { requirementExtractionSchema, type RequirementExtraction } from "@teams-observer/core";

export function parseRequirementExtraction(text: string): RequirementExtraction {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    return { requirements: [] };
  }

  const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  return requirementExtractionSchema.parse(parsed);
}
