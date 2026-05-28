import type {
  AgentAnswer,
  AgentContextBundle,
  ExtractedRequirement,
  MeetingNotesContext,
} from "@context-pilot/core";

export type AiProviderKind = "LOCAL_OPENAI" | "CLAUDE_CODE_CLI";

export type ThreadSummaryResult = {
  summary: string;
  evidenceMessageIds: string[];
  model: string;
  confidence?: number;
};

export type RequirementExtractionResult = {
  requirements: ExtractedRequirement[];
  model: string;
};

export type MeetingNotesResult = {
  summary: string;
  openQuestions: string[];
  actionItems: string[];
  model: string;
};

export type AiProvider = {
  kind: AiProviderKind;
  model: string;
  summarizeThread(input: AgentContextBundle): Promise<ThreadSummaryResult>;
  extractRequirements(input: AgentContextBundle): Promise<RequirementExtractionResult>;
  answerQuestion(input: AgentContextBundle & { question: string }): Promise<AgentAnswer>;
  summarizeMeeting(input: MeetingNotesContext): Promise<MeetingNotesResult>;
};
