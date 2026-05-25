import type { AgentContextBundle } from "@teams-observer/core";
import { renderContextBundle, safetySystemPrompt } from "./context";

export function buildRequirementsPrompt(input: AgentContextBundle): string {
  return `${safetySystemPrompt}\n\nExtract quoting-ready requirement cards from the Teams evidence. Return only valid JSON with this shape:\n{\"requirements\":[{\"title\":\"...\",\"description\":\"...\",\"category\":\"BUSINESS_GOAL|USER_ROLE|WORKFLOW|FEATURE|CONSTRAINT|OPEN_QUESTION|RISK|ASSUMPTION\",\"priority\":\"optional\",\"evidenceMessageIds\":[\"message-id\"]}]}\n\nOnly include a requirement when there is evidence.\n\n${renderContextBundle(input)}`;
}
