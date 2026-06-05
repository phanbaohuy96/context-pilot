import type {
  AgentAnswer,
  AgentContextBundle,
  AiProviderKind,
  ExtractedRequirement,
  MeetingNotesContext,
  PreparedMeetingContext,
  TranscriptCorrectionContext,
  TranslationContext,
} from "@context-pilot/core";

export type { AiProviderKind };

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

export type MeetingContextPreparationResult = PreparedMeetingContext & {
  model: string;
};

export type TranscriptCorrectionResult = {
  text: string;
  model: string;
};

export type TranslationResult = {
  text: string;
  model: string;
};

export type AiProvider = {
  kind: AiProviderKind;
  model: string;
  summarizeThread(input: AgentContextBundle): Promise<ThreadSummaryResult>;
  extractRequirements(input: AgentContextBundle): Promise<RequirementExtractionResult>;
  answerQuestion(input: AgentContextBundle & { question: string }): Promise<AgentAnswer>;
  prepareMeetingContext(input: { title?: string; contextText: string }): Promise<MeetingContextPreparationResult>;
  summarizeMeeting(input: MeetingNotesContext): Promise<MeetingNotesResult>;
  correctTranscript(input: TranscriptCorrectionContext): Promise<TranscriptCorrectionResult>;
  translateText(input: TranslationContext): Promise<TranslationResult>;
};
