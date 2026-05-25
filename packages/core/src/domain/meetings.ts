import { z } from "zod";

export const meetingPlatformSchema = z.enum(["TEAMS", "GOOGLE_MEET", "ZOOM", "BROWSER", "OTHER"]);
export type MeetingPlatform = z.infer<typeof meetingPlatformSchema>;

export const meetingStatusSchema = z.enum(["ACTIVE", "ENDED", "ERROR"]);
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;

export const meetingSpeakerRoleSchema = z.enum(["SELF", "OTHER", "UNKNOWN"]);
export type MeetingSpeakerRole = z.infer<typeof meetingSpeakerRoleSchema>;

export const meetingSourceChannelSchema = z.enum(["MIC", "LOOPBACK", "MIXED", "IMPORTED"]);
export type MeetingSourceChannel = z.infer<typeof meetingSourceChannelSchema>;

export const meetingInsightKindSchema = z.enum([
  "NOTE",
  "QUESTION_FOR_YOU",
  "NAME_MENTION",
  "ACTION_ITEM",
  "ANSWER_SUGGESTION",
]);
export type MeetingInsightKind = z.infer<typeof meetingInsightKindSchema>;

export const createMeetingSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Untitled meeting"),
  platform: meetingPlatformSchema.default("OTHER"),
  sourceId: z.string().trim().min(1).optional(),
  externalContextId: z.string().trim().min(1).max(500).optional(),
});
export type CreateMeetingSessionInput = z.infer<typeof createMeetingSessionSchema>;

export const updateMeetingSessionSchema = z
  .object({
    status: meetingStatusSchema.optional(),
    endedAt: z.coerce.date().optional(),
  })
  .refine((value) => value.status || value.endedAt, "Provide a status or endedAt update.");
export type UpdateMeetingSessionInput = z.infer<typeof updateMeetingSessionSchema>;

export const ingestTranscriptUtteranceSchema = z
  .object({
    speakerRole: meetingSpeakerRoleSchema.default("UNKNOWN"),
    sourceChannel: meetingSourceChannelSchema.default("MIXED"),
    startedAt: z.coerce.date().optional(),
    endedAt: z.coerce.date().optional(),
    text: z.string().trim().min(1).max(8000),
    confidence: z.number().min(0).max(1).optional(),
    engineMetadata: z.unknown().optional(),
  })
  .refine(
    (value) => !value.startedAt || !value.endedAt || value.endedAt >= value.startedAt,
    "endedAt must be after startedAt.",
  );
export type IngestTranscriptUtteranceInput = z.infer<typeof ingestTranscriptUtteranceSchema>;

export type MeetingAssistDetectionInput = {
  utteranceId: string;
  text: string;
  speakerRole: MeetingSpeakerRole;
  userName?: string;
};

export type DetectedMeetingInsight = {
  kind: MeetingInsightKind;
  text: string;
  keywords: string[];
  relatedUtteranceIds: string[];
  confidence: number;
};

const questionPatterns = [
  /\?\s*$/,
  /\b(can|could|would|will|do|does|did|are|is|should)\s+you\b/i,
  /\bwhat do you think\b/i,
  /\bany thoughts\b/i,
  /\bcan you explain\b/i,
];

const actionPatterns = [
  /\b(please|kindly)\s+(check|confirm|review|send|share|prepare|follow up|update)\b/i,
  /\b(can|could|would|will)\s+you\s+(check|confirm|review|send|share|prepare|follow up|update)\b/i,
  /\byou\s+(need to|should|have to)\b/i,
  /\b(action item|todo|to-do|follow up)\b/i,
];

export function detectMeetingAssistInsights(input: MeetingAssistDetectionInput): DetectedMeetingInsight[] {
  if (input.speakerRole === "SELF") {
    return [];
  }

  const normalizedText = input.text.replaceAll(/\s+/g, " ").trim();
  if (!normalizedText) {
    return [];
  }

  const insights: DetectedMeetingInsight[] = [];
  const keywords = extractKeywords(normalizedText);

  if (questionPatterns.some((pattern) => pattern.test(normalizedText))) {
    insights.push({
      kind: "QUESTION_FOR_YOU",
      text: `Possible question for you: ${normalizedText}`,
      keywords,
      relatedUtteranceIds: [input.utteranceId],
      confidence: normalizedText.includes("?") ? 0.85 : 0.72,
    });
    insights.push({
      kind: "ANSWER_SUGGESTION",
      text: buildAnswerSuggestion(normalizedText, keywords),
      keywords,
      relatedUtteranceIds: [input.utteranceId],
      confidence: 0.64,
    });
  }

  if (actionPatterns.some((pattern) => pattern.test(normalizedText))) {
    insights.push({
      kind: "ACTION_ITEM",
      text: `Likely action item: ${normalizedText}`,
      keywords,
      relatedUtteranceIds: [input.utteranceId],
      confidence: 0.74,
    });
  }

  const userName = input.userName?.trim();
  if (userName && new RegExp(`\\b${escapeRegExp(userName)}\\b`, "i").test(normalizedText)) {
    insights.push({
      kind: "NAME_MENTION",
      text: `Your name was mentioned: ${normalizedText}`,
      keywords,
      relatedUtteranceIds: [input.utteranceId],
      confidence: 0.78,
    });
  }

  return insights;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "could",
    "please",
    "should",
    "that",
    "their",
    "there",
    "think",
    "this",
    "what",
    "would",
    "you",
    "your",
  ]);
  const words = text
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));

  return Array.from(new Set(words)).slice(0, 6);
}

function buildAnswerSuggestion(text: string, keywords: string[]): string {
  if (keywords.length) {
    return `Reply idea: acknowledge the question, then answer around ${keywords.slice(0, 4).join(", ")}.`;
  }

  return `Reply idea: acknowledge the question, then give a short direct answer. Context: ${text}`;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
