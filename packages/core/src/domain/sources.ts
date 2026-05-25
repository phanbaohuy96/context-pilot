import { z } from "zod";

export const sourceTypeSchema = z.enum(["TEAM_CHANNEL", "GROUP_CHAT", "CHAT"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "PAUSED",
  "DISABLED",
  "ERROR",
]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const monitoredSourceInputSchema = z
  .object({
    displayName: z.string().min(1).max(200),
    sourceType: sourceTypeSchema,
    teamId: z.string().trim().optional(),
    channelId: z.string().trim().optional(),
    chatId: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceType === "TEAM_CHANNEL" && (!value.teamId || !value.channelId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Team channel sources require both teamId and channelId.",
        path: ["channelId"],
      });
    }

    if ((value.sourceType === "GROUP_CHAT" || value.sourceType === "CHAT") && !value.chatId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chat sources require chatId.",
        path: ["chatId"],
      });
    }
  });

export type MonitoredSourceInput = z.infer<typeof monitoredSourceInputSchema>;
