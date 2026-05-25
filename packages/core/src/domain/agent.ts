export type EvidenceMessage = {
  id: string;
  sourceName: string;
  senderName?: string | null;
  createdAt: Date | string;
  contentText: string;
};

export type AgentContextBundle = {
  question?: string;
  messages: EvidenceMessage[];
  summaries?: Array<{
    id: string;
    threadId: string;
    summary: string;
    evidenceMessageIds: string[];
  }>;
  requirements?: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    evidenceMessageIds: string[];
  }>;
};

export type AgentAnswer = {
  answer: string;
  evidenceMessageIds: string[];
  model: string;
};
