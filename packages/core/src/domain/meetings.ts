import { z } from "zod";
import { ASSIST_LABEL_PREFIXES } from "./assist-display";
import {
  isInterimMetadata,
  mergedSourceIdsFromMetadata,
  speakerKeyFromMetadata,
  supersededByFromMetadata,
} from "./speaker-metadata";

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
  contextText: z.string().trim().max(60000).optional(),
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

export const preparedMeetingContextSchema = z.object({
  briefing: z.string().trim().default(""),
  agendaItems: z.array(z.string().trim().min(1)).default([]),
  openQuestions: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string().trim().min(1)).default([]),
  keywords: z.array(z.string().trim().min(1)).default([]),
});
export type PreparedMeetingContext = z.infer<typeof preparedMeetingContextSchema>;

export type MeetingTranscriptLine = { speaker: string; text: string };
export type MeetingNotesContext = {
  title?: string;
  context?: PreparedMeetingContext;
  transcript: MeetingTranscriptLine[];
};

// Input for merge-correction: the ordered text fragments of one spoken utterance that
// the speech-to-text split across rows, plus the speaker for context.
export type TranscriptCorrectionContext = {
  speaker?: string;
  segments: string[];
};

// Input for translating a single transcript line into the target language. `context` holds
// a few surrounding transcript lines (reference only — not translated) so the model can
// resolve pronouns/terms that a line in isolation would lose.
export type TranslationContext = {
  text: string;
  targetLanguage: string;
  context?: string[];
};

// A finalized transcript row considered for merge-correction. Mirrors the relevant
// TranscriptUtterance columns without importing Prisma types into core.
export type MergeCandidate = {
  id: string;
  speakerRole: MeetingSpeakerRole;
  sourceChannel: MeetingSourceChannel;
  startedAt: Date;
  endedAt?: Date | null;
  text: string;
  confidence?: number | null;
  engineMetadata?: unknown;
};

export type MergeGroup = {
  members: MergeCandidate[];
};

// Consecutive same-speaker fragments closer together than this are candidates to be
// one sentence the speech-to-text chopped on a brief pause.
export const MERGE_MAX_GAP_MS = 2500;

// A turn normally closes (becoming mergeable) when another speaker takes over or the
// speaker pauses past MERGE_MAX_GAP_MS. A continuous solo monologue (no speaker change, no
// long pause, no sentence-final punctuation) would never close live and only stitch at the
// end. Once an open trailing run grows past this many fragments, close all but the most
// recent one so a monologue still merges incrementally while it is being spoken.
export const MERGE_MAX_OPEN_RUN = 6;

// True when text ends on sentence-final punctuation (allowing trailing quotes/brackets),
// i.e. it reads as a complete sentence rather than a cut-off fragment.
export function endsWithTerminalPunctuation(text: string): boolean {
  return /[.!?…]["')\]]*\s*$/.test(text.trim());
}

function spanEndMs(candidate: MergeCandidate): number {
  return (candidate.endedAt ?? candidate.startedAt).getTime();
}

function eligibleMergeCandidates(utterances: MergeCandidate[]): MergeCandidate[] {
  return [...utterances]
    .filter(
      (utterance) =>
        utterance.text.trim() &&
        !isInterimMetadata(utterance.engineMetadata) &&
        !mergedSourceIdsFromMetadata(utterance.engineMetadata) &&
        !supersededByFromMetadata(utterance.engineMetadata),
    )
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

// True when `next` reads as a continuation of `previous`'s spoken turn: same speaker
// (role + diarized key) and channel, only a small pause between them, and `previous` did
// not already end on sentence-final punctuation. This is the single boundary rule shared
// by grouping and by `closedMergeCandidates` so the merge trigger and the merge grouping
// can never disagree.
function mergeContinues(previous: MergeCandidate, next: MergeCandidate): boolean {
  return (
    next.speakerRole === previous.speakerRole &&
    next.sourceChannel === previous.sourceChannel &&
    speakerKeyFromMetadata(next.engineMetadata) === speakerKeyFromMetadata(previous.engineMetadata) &&
    next.startedAt.getTime() - spanEndMs(previous) <= MERGE_MAX_GAP_MS &&
    !endsWithTerminalPunctuation(previous.text)
  );
}

// Deterministically group consecutive utterances that look like one sentence split
// across rows: same speaker (role + diarized key) and channel, a small inter-row gap,
// and a previous fragment that does NOT end on sentence-final punctuation. Interim,
// already-merged, already-superseded, and empty rows are ignored. Only groups of two or
// more rows are returned (a lone row needs no correction). The model decides the merged
// text; this function only decides which rows are candidates.
export function groupMergeableUtterances(utterances: MergeCandidate[]): MergeGroup[] {
  const eligible = eligibleMergeCandidates(utterances);

  const groups: MergeGroup[] = [];
  let current: MergeCandidate[] = [];

  const flush = () => {
    if (current.length >= 2) {
      groups.push({ members: current });
    }
    current = [];
  };

  for (const utterance of eligible) {
    if (!current.length) {
      current = [utterance];
      continue;
    }
    if (mergeContinues(current[current.length - 1], utterance)) {
      current.push(utterance);
    } else {
      flush();
      current = [utterance];
    }
  }
  flush();

  return groups;
}

// The trailing turn may still be growing — the speaker could resume after a brief pause —
// so during a live meeting it is not yet safe to merge. A turn is only "closed" once a
// boundary follows it: a different speaker takes over, or the same speaker pauses past
// MERGE_MAX_GAP_MS (or ends on sentence-final punctuation). This drops that still-open
// trailing run and returns only the closed turns, so live correction fires on a speaker
// change rather than after an arbitrary number of new rows. The end-of-meeting pass merges
// everything instead and does not need this.
export function closedMergeCandidates(utterances: MergeCandidate[]): MergeCandidate[] {
  const eligible = eligibleMergeCandidates(utterances);
  if (eligible.length < 2) {
    return [];
  }
  let openRunStart = eligible.length - 1;
  while (openRunStart > 0 && mergeContinues(eligible[openRunStart - 1], eligible[openRunStart])) {
    openRunStart -= 1;
  }
  // A monologue whose open run never closes would never merge live. Once the open run is
  // long enough that waiting is pointless, close all but the most recent fragment (which may
  // still continue the current sentence), so the bulk of the monologue stitches live.
  if (eligible.length - openRunStart > MERGE_MAX_OPEN_RUN) {
    return eligible.slice(0, eligible.length - 1);
  }
  return eligible.slice(0, openRunStart);
}

export type MeetingAssistDetectionInput = {
  utteranceId: string;
  text: string;
  speakerRole: MeetingSpeakerRole;
  userName?: string;
  context?: PreparedMeetingContext;
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
      text: `${ASSIST_LABEL_PREFIXES.QUESTION_FOR_YOU} ${questionText}`,
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
      text: `${ASSIST_LABEL_PREFIXES.ACTION_ITEM} ${actionText}`,
      keywords: extractKeywords(actionText),
      relatedUtteranceIds: [input.utteranceId],
      confidence: 0.74,
    });
  }

  const userName = input.userName?.trim();
  if (userName && new RegExp(`\\b${escapeRegExp(userName)}\\b`, "i").test(normalizedText)) {
    insights.push({
      kind: "NAME_MENTION",
      text: `${ASSIST_LABEL_PREFIXES.NAME_MENTION} ${normalizedText}`,
      keywords,
      relatedUtteranceIds: [input.utteranceId],
      confidence: 0.78,
    });
  }

  const contextualNote = detectContextualNote(normalizedText, input);
  if (contextualNote) {
    insights.push(contextualNote);
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
  const prefix = ASSIST_LABEL_PREFIXES.ANSWER_SUGGESTION;
  if (keywords.length) {
    return `${prefix} acknowledge the question, then answer around ${keywords.slice(0, 4).join(", ")}.`;
  }

  return `${prefix} acknowledge the question, then give a short direct answer. Context: ${text}`;
}

function detectContextualNote(
  normalizedText: string,
  input: MeetingAssistDetectionInput,
): DetectedMeetingInsight | null {
  const context = input.context;
  if (!context) {
    return null;
  }

  const contextKeywords = contextKeywordCandidates(context);
  const matched = contextKeywords
    .filter((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(normalizedText))
    .slice(0, 5);
  if (!matched.length) {
    return null;
  }

  const agendaItem = context.agendaItems.find((item) =>
    matched.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(item)),
  );
  return {
    kind: "NOTE",
    text: agendaItem
      ? `Agenda signal: ${agendaItem}`
      : `Agenda signal: discussion matched ${matched.join(", ")}.`,
    keywords: matched,
    relatedUtteranceIds: [input.utteranceId],
    confidence: 0.66,
  };
}

function contextKeywordCandidates(context: PreparedMeetingContext): string[] {
  const values = [
    ...context.keywords,
    ...context.agendaItems.flatMap(extractKeywords),
    ...context.openQuestions.flatMap(extractKeywords),
    ...context.risks.flatMap(extractKeywords),
  ];
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase().trim();
    if (normalized.length < 4 || KEYWORD_STOP_WORDS.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    candidates.push(normalized);
  }
  return candidates.slice(0, 40);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
