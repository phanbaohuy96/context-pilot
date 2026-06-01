import { createAiProvider, promptVersion } from "@context-pilot/ai";
import {
  speakerAliasFromMetadata,
  speakerKeyFromMetadata,
  speakerLabelFromMetadata,
  supersededByFromMetadata,
  type MeetingTranscriptLine,
} from "@context-pilot/core";
import { prisma, resolveTenantAiProviderConfig } from "@context-pilot/db";
import type { TranscriptUtterance } from "@prisma/client";

// Regenerate rolling notes after this many new finalized utterances since the last run.
const MIN_NEW_UTTERANCES = Number(process.env.MEETING_NOTES_MIN_NEW_UTTERANCES) || 6;
// Cap the prompt: summarize from the most recent window rather than the whole meeting.
const MAX_TRANSCRIPT_LINES = 120;

function notesEnabled(): boolean {
  // Opt-in: notes send transcript text to an LLM provider, so they stay off unless
  // explicitly enabled.
  return process.env.MEETING_NOTES === "true";
}

type NotesState = { inFlight: boolean; lastCount: number };
const states = new Map<string, NotesState>();

function buildSpeakerAliases(utterances: TranscriptUtterance[]): Record<number, string> {
  const aliases: Record<number, string> = {};
  for (const utterance of utterances) {
    const key = speakerKeyFromMetadata(utterance.engineMetadata);
    const alias = speakerAliasFromMetadata(utterance.engineMetadata);
    if (key && alias) {
      aliases[key] = alias;
    }
  }
  return aliases;
}

function speakerName(utterance: TranscriptUtterance, aliases: Record<number, string>): string {
  if (utterance.speakerRole === "SELF") {
    return "You";
  }
  if (utterance.speakerRole === "OTHER") {
    const key = speakerKeyFromMetadata(utterance.engineMetadata);
    return (key ? aliases[key] : undefined)
      ?? speakerAliasFromMetadata(utterance.engineMetadata)
      ?? speakerLabelFromMetadata(utterance.engineMetadata)
      ?? "Participant";
  }
  return "Speaker";
}

function isInterim(utterance: TranscriptUtterance): boolean {
  return (utterance.engineMetadata as { interim?: boolean } | null)?.interim === true;
}

// Fire-and-forget from the capture path: when enough new utterances have accumulated,
// summarize the recent transcript with the configured provider and upsert the
// meeting's rolling MeetingSummary. Throttled and serialized per meeting; any failure
// is logged and swallowed so it never disrupts capture.
export async function maybeGenerateMeetingNotes(meetingId: string): Promise<void> {
  if (!notesEnabled()) {
    return;
  }
  const state = states.get(meetingId) ?? { inFlight: false, lastCount: 0 };
  states.set(meetingId, state);
  if (state.inFlight) {
    return;
  }
  state.inFlight = true; // claim synchronously before any await so two runners can't race
  try {
    const utterances = await prisma.transcriptUtterance.findMany({
      where: { meetingSessionId: meetingId },
      orderBy: { startedAt: "asc" },
    });
    const finalized = utterances.filter(
      (utterance) => !isInterim(utterance) && utterance.text.trim(),
    );
    // Throttle on the count of finalized rows, which only grows (originals are retained even
    // after a correction merge adds a new row). Gating on the superseded-excluded `finals`
    // below would not: a merge shrinks that set, so it could dip under the threshold and
    // stall notes mid-meeting.
    if (finalized.length - state.lastCount < MIN_NEW_UTTERANCES) {
      return;
    }
    // Advance the counter before generating (not after success): on a provider
    // failure we'd rather wait for the next window than retry on every finalize and
    // hammer a down provider.
    state.lastCount = finalized.length;

    // Exclude superseded fragments from the transcript we send so a corrected sentence isn't
    // sent to the LLM both as its merged row and its original halves (merged row is kept).
    const finals = finalized.filter(
      (utterance) => !supersededByFromMetadata(utterance.engineMetadata),
    );

    const aliases = buildSpeakerAliases(finals);
    const transcript: MeetingTranscriptLine[] = finals
      .slice(-MAX_TRANSCRIPT_LINES)
      .map((utterance) => ({ speaker: speakerName(utterance, aliases), text: utterance.text }));
    const meeting = await prisma.meetingSession.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return;
    }

    const resolvedProvider = await resolveTenantAiProviderConfig(
      prisma,
      meeting.tenantId,
      "MEETING_NOTES",
    );
    const provider = createAiProvider(resolvedProvider.providerKind, resolvedProvider.providerConfig);
    const notes = await provider.summarizeMeeting({ title: meeting.title, transcript });
    if (!notes.summary && !notes.openQuestions.length && !notes.actionItems.length) {
      return;
    }

    // One rolling summary per meeting: update the latest if present, else create.
    const data = {
      summary: notes.summary,
      openQuestions: notes.openQuestions,
      actionItems: notes.actionItems,
      provider: provider.kind,
      model: notes.model,
      promptVersion,
    };
    const existing = await prisma.meetingSummary.findFirst({
      where: { meetingSessionId: meetingId },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      await prisma.meetingSummary.update({ where: { id: existing.id }, data });
    } else {
      await prisma.meetingSummary.create({ data: { meetingSessionId: meetingId, ...data } });
    }
  } catch (error) {
    console.error(`meeting notes generation failed for ${meetingId}:`, error);
  } finally {
    state.inFlight = false;
  }
}
