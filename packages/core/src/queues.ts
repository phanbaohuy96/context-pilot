import type { AiProviderKind } from "./ai-settings";

export const queueNames = {
  graphNotifications: "graph-notifications",
  summarizeThread: "summarize-thread",
  renewSubscriptions: "renew-subscriptions",
} as const;

export type GraphNotificationJobData = {
  subscriptionId: string;
  changeType: string;
  resource: string;
  clientState?: string;
  tenantId?: string;
  resourceDataId?: string;
};

export type SummarizeThreadJobData = {
  sourceId: string;
  threadId: string;
  provider?: AiProviderKind;
};
