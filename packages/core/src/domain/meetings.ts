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

// Whisper (especially the tiny models used for local capture) emits a small set of
// stock phrases when fed near-silent audio — a quiet mic picking up room noise gets
// "transcribed" as one of these. Treat them as noise so they never reach the
// transcript or assist detection.
const HALLUCINATED_TRANSCRIPTIONS = new Set([
  "you",
  "thank you",
  "thank you very much",
  "thank you so much",
  "thanks",
  "thanks for watching",
  "bye",
  "bye bye",
  "see you next time",
]);

// True when a transcription almost certainly came from silence/noise rather than
// speech: either it is a known Whisper silence-hallucination phrase, or it has no
// alphanumeric content at all (e.g. Whisper's "♪♪" music markers, bare punctuation).
export function isLikelyHallucinatedTranscription(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return true;
  }
  return HALLUCINATED_TRANSCRIPTIONS.has(normalized);
}

export type TranscriptionToken = { text?: string; p?: number };
export type TranscriptionSegment = { tokens?: TranscriptionToken[] };

// Utterance confidence from whisper's token-level output (-ojf JSON): the mean
// probability of the real tokens, ignoring whisper's special "[...]" markers (e.g.
// "[_BEG_]") so they don't skew it. Returns undefined when there are no real tokens,
// and clamps to [0,1] to satisfy the schema.
export function meanTokenConfidence(segments: TranscriptionSegment[]): number | undefined {
  let sum = 0;
  let count = 0;
  for (const segment of segments) {
    for (const token of segment.tokens ?? []) {
      if (typeof token.p === "number" && token.text && !token.text.trim().startsWith("[")) {
        sum += token.p;
        count += 1;
      }
    }
  }
  return count ? Math.min(1, Math.max(0, sum / count)) : undefined;
}

// Synthesized rolling meeting notes (LLM output). Arrays default to empty so a model
// that omits a field still parses.
export const meetingNotesSchema = z.object({
  summary: z.string().trim().default(""),
  openQuestions: z.array(z.string().trim().min(1)).default([]),
  actionItems: z.array(z.string().trim().min(1)).default([]),
});
export type MeetingNotes = z.infer<typeof meetingNotesSchema>;

export type MeetingTranscriptLine = { speaker: string; text: string };
export type MeetingNotesContext = {
  title?: string;
  transcript: MeetingTranscriptLine[];
};

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
    // Surface just the question, not the whole multi-sentence utterance it was
    // buried in, so the card reads as the actual thing being asked.
    const questionText = matchingSentences(normalizedText, questionPatterns) || normalizedText;
    const questionKeywords = extractKeywords(questionText);
    insights.push({
      kind: "QUESTION_FOR_YOU",
      text: `Possible question for you: ${questionText}`,
      keywords: questionKeywords,
      relatedUtteranceIds: [input.utteranceId],
      confidence: questionText.includes("?") ? 0.85 : 0.72,
    });
    insights.push({
      kind: "ANSWER_SUGGESTION",
      text: buildAnswerSuggestion(questionText, questionKeywords),
      keywords: questionKeywords,
      relatedUtteranceIds: [input.utteranceId],
      confidence: 0.64,
    });
  }

  if (actionPatterns.some((pattern) => pattern.test(normalizedText))) {
    const actionText = matchingSentences(normalizedText, actionPatterns) || normalizedText;
    insights.push({
      kind: "ACTION_ITEM",
      text: `Likely action item: ${actionText}`,
      keywords: extractKeywords(actionText),
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

// Splits transcribed text into sentences, keeping a trailing fragment that has no
// terminal punctuation (Whisper often cuts a final clause without a period). A
// `.`/`!`/`?` only ends a sentence when followed by whitespace + a capital/opening
// bracket or end of text, so decimals ("v1.5") and most abbreviations ("U.S.")
// in transcribed speech aren't chopped mid-clause.
function splitSentences(text: string): string[] {
  return (text.match(/.+?(?:[.!?]+(?=\s+[A-Z("']|\s*$)|$)/g) ?? [text])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

// Returns only the sentences that match one of the given patterns, joined back
// together; empty when none match so the caller can fall back to the full text.
function matchingSentences(text: string, patterns: RegExp[]): string {
  return splitSentences(text)
    .filter((sentence) => patterns.some((pattern) => pattern.test(sentence)))
    .join(" ");
}

// High-frequency function words and conversational filler (>= 4 chars; shorter words
// are already excluded by the length floor). Kept deliberately to function words and
// filler — not topical nouns/verbs — so the surviving keywords describe the subject.
const KEYWORD_STOP_WORDS = new Set([
  "about", "actually", "after", "again", "against", "almost", "already", "also",
  "always", "among", "another", "anybody", "anymore", "anyone", "anything", "around",
  "basically", "because", "been", "before", "being", "below", "between", "both",
  "could", "definitely", "does", "doing", "done", "down", "during", "each", "else",
  "even", "ever", "every", "everyone", "everything", "from", "gonna", "going", "gotta",
  "have", "having", "here", "honestly", "into", "just", "keep", "kept", "kind", "kinda",
  "know", "known", "knows", "like", "likely", "literally", "made", "make", "makes",
  "making", "many", "maybe", "mean", "means", "might", "more", "most", "much", "must",
  "obviously", "okay", "once", "only", "other", "over", "please", "pretty", "probably",
  "quite", "rather", "really", "right", "said", "same", "says", "seem", "seems", "seen",
  "should", "since", "some", "somebody", "someone", "something", "sort", "still",
  "stuff", "such", "sure", "than", "that", "their", "them", "then", "there", "these",
  "they", "thing", "things", "think", "this", "those", "though", "through", "trying",
  "under", "until", "very", "want", "wanted", "wants", "well", "were", "what",
  "whatever", "when", "where", "which", "while", "whole", "with", "without", "would",
  "yeah", "your",
]);

// Topic-hint keywords for an assist card. Ranks by frequency (a word repeated across
// the text is more likely the subject) then by first appearance, so the keywords are
// the salient terms rather than just the earliest ones.
function extractKeywords(text: string): string[] {
  const seen = new Map<string, { count: number; firstIndex: number }>();
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .forEach((word, index) => {
      if (word.length < 4 || KEYWORD_STOP_WORDS.has(word)) {
        return;
      }
      const existing = seen.get(word);
      if (existing) {
        existing.count += 1;
      } else {
        seen.set(word, { count: 1, firstIndex: index });
      }
    });

  return Array.from(seen.entries())
    .sort(([, a], [, b]) => b.count - a.count || a.firstIndex - b.firstIndex)
    .slice(0, 6)
    .map(([word]) => word);
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
