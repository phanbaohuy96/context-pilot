import { z } from "zod";

export const graphNotificationSchema = z.object({
  subscriptionId: z.string(),
  changeType: z.string(),
  resource: z.string(),
  clientState: z.string().optional(),
  tenantId: z.string().optional(),
  resourceData: z
    .object({
      id: z.string().optional(),
      odataType: z.string().optional(),
      odataId: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export const graphNotificationEnvelopeSchema = z.object({
  value: z.array(graphNotificationSchema),
});

export type GraphNotification = z.infer<typeof graphNotificationSchema>;
export type GraphNotificationEnvelope = z.infer<typeof graphNotificationEnvelopeSchema>;

export type NormalizedTeamsMessage = {
  externalId: string;
  threadId: string;
  replyToId?: string;
  senderName?: string;
  senderId?: string;
  subject?: string;
  contentHtml?: string;
  contentText: string;
  webUrl?: string;
  createdAt: Date;
  rawJson: unknown;
};
