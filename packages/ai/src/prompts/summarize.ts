import type { AgentContextBundle } from "@context-pilot/core";
import { renderContextBundle, safetySystemPrompt } from "./context";

export function buildSummarizePrompt(input: AgentContextBundle): string {
  return `${safetySystemPrompt}\n\nSummarize the conversation for a quoting/estimation discovery process. Focus on business context, users, workflows, features, constraints, risks, assumptions, and open questions. Include evidence message IDs inline.\n\n${renderContextBundle(input)}`;
}
