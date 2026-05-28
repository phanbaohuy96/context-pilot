import type { AgentContextBundle } from "@context-pilot/core";
import { renderContextBundle, safetySystemPrompt } from "./context";

export function buildAnswerPrompt(input: AgentContextBundle & { question: string }): string {
  return `${safetySystemPrompt}\n\nAnswer this discovery question for mobile app quoting: ${input.question}\n\nUse only the provided evidence. If the evidence is insufficient, say what is missing. Cite message IDs inline.\n\n${renderContextBundle(input)}`;
}
