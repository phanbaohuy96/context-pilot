import { createAiProvider, type AiProvider } from "@context-pilot/ai";
import {
  closedMergeCandidates,
  groupMergeableUtterances,
  isInterimMetadata,
  mergedSourceIdsFromMetadata,
  metadataAsMerged,
  metadataWithSupersededBy,
  speakerAliasFromMetadata,
  speakerKeyFromMetadata,
  speakerLabelFromMetadata,
  supersededByFromMetadata,
  type MergeCandidate,
  type MergeGroup,
} from "@context-pilot/core";
import { prisma, resolveAiProviderConfigFromSettings } from "@context-pilot/db";
import type { AiProviderSettings, Prisma } from "@prisma/client";

// Serializes correction runs per meeting and lets the final pass wait for an in-flight live
// run instead of dropping it. There is no count throttle: a run only calls the provider when
// `closedMergeCandidates` exposes a newly-closed multi-fragment turn, and merged rows are
// excluded next time, so re-running on every finalize is cheap and idempotent.
const inFlight = new Map<string, Promise<void>>();

// Merge candidates are always a short trailing run, so the live pass fetches only the recent
// window instead of the whole meeting (which would be O(n) per finalize → O(n^2) overall).
// Older closed groups were already merged by earlier passes; the window only needs to be far
// larger than any plausible single group. The final pass fetches everything once.
const CORRECTION_FETCH_WINDOW = 200;

function isFinalized(utterance: { text: string; engineMetadata: Prisma.JsonValue }): boolean {
  return !!utterance.text.trim() && !isInterimMetadata(utterance.engineMetadata);
}

function speakerNameFor(utterance: MergeCandidate): string | undefined {
  if (utterance.speakerRole === "SELF") {
    return "You";
  }
  return (
    speakerAliasFromMetadata(utterance.engineMetadata) ??
    speakerLabelFromMetadata(utterance.engineMetadata) ??
    undefined
  );
}

async function mergeGroup(meetingId: string, provider: AiProvider, group: MergeGroup): Promise<void> {
  const members = group.members;
  const first = members[0];
  const last = members[members.length - 1];

  const corrected = await provider.correctTranscript({
    speaker: speakerNameFor(first),
    segments: members.map((member) => member.text),
  });
  // Grouping already decided these fragments form one utterance; the model only cleans up
  // the joins. If it returns nothing usable, fall back to a plain join so the group is
  // still merged (and its fragments superseded) — otherwise the same group is re-selected
  // and re-sent to the provider on every later finalize, an unbounded retry loop.
  const text = corrected.text.trim()
    || members.map((member) => member.text.trim()).filter(Boolean).join(" ");
  if (!text) {
    return;
  }

  // A merged row is no more confident than its least-confident fragment — and if any
  // fragment was never scored (null/undefined confidence), the merge's confidence is
  // unknown too, not the min of the ones that happen to be scored.
  const confidences = members.map((member) => member.confidence);
  const confidence = confidences.every((value) => typeof value === "number")
    ? Math.min(...(confidences as number[]))
    : null;

  // Carry the speaker labelling forward so the merged bubble keeps its name.
  const speakerMeta: Record<string, unknown> = {};
  const speakerKey = speakerKeyFromMetadata(first.engineMetadata);
  const speakerLabel = speakerLabelFromMetadata(first.engineMetadata);
  const speakerAlias = speakerAliasFromMetadata(first.engineMetadata);
  if (speakerKey != null) speakerMeta.speakerKey = speakerKey;
  if (speakerLabel) speakerMeta.speakerLabel = speakerLabel;
  if (speakerAlias) speakerMeta.speakerAlias = speakerAlias;

  await prisma.$transaction(async (tx) => {
    const merged = await tx.transcriptUtterance.create({
      data: {
        meetingSessionId: meetingId,
        speakerRole: first.speakerRole,
        sourceChannel: first.sourceChannel,
        startedAt: first.startedAt,
        endedAt: last.endedAt ?? last.startedAt,
        confidence,
        text,
        engineMetadata: metadataAsMerged(
          speakerMeta,
          members.map((member) => member.id),
        ) as Prisma.InputJsonValue,
      },
    });
    for (const member of members) {
      await tx.transcriptUtterance.update({
        where: { id: member.id },
        data: {
          engineMetadata: metadataWithSupersededBy(member.engineMetadata, merged.id) as Prisma.InputJsonValue,
        },
      });
    }
  });
}

async function runCorrection(
  meetingId: string,
  options: { final?: boolean; settings?: AiProviderSettings | null },
): Promise<void> {
  // The live path passes the settings the capture runner already loaded for this finalize; the
  // final pass passes none, so load fresh (it must reflect a just-flipped toggle at meeting end).
  let settings = options.settings;
  if (settings === undefined) {
    const meeting = await prisma.meetingSession.findUnique({
      where: { id: meetingId },
      include: { tenant: { include: { aiProviderSettings: true } } },
    });
    if (!meeting) {
      return;
    }
    settings = meeting.tenant.aiProviderSettings;
  }
  // Correction is off by default and configured per-tenant on /settings (not an env flag), so
  // bail before any heavier work when it is disabled.
  if (!settings?.meetingCorrectionEnabled) {
    return;
  }

  // Live: only the recent window holds mergeable candidates. Final: the whole meeting, once.
  const utterances = await prisma.transcriptUtterance.findMany({
    where: { meetingSessionId: meetingId },
    orderBy: { startedAt: "desc" },
    ...(options.final ? {} : { take: CORRECTION_FETCH_WINDOW }),
  });
  utterances.reverse();
  const eligible = utterances.filter(
    (utterance) =>
      isFinalized(utterance) &&
      !mergedSourceIdsFromMetadata(utterance.engineMetadata) &&
      !supersededByFromMetadata(utterance.engineMetadata),
  );
  // Live: only merge turns a speaker change (or a long pause) has already closed — the
  // open trailing turn may still continue. Final: stitch everything, including the tail.
  const candidates = options.final ? eligible : closedMergeCandidates(eligible);
  const groups = groupMergeableUtterances(candidates);
  if (!groups.length) {
    return;
  }

  const resolved = resolveAiProviderConfigFromSettings(settings, "MEETING_NOTES");
  const provider = createAiProvider(resolved.providerKind, resolved.providerConfig);

  // Independent groups run concurrently: the final pass is awaited by the end-session
  // handler, so serializing every group's provider call would make ending a meeting hang
  // for the sum of all latencies.
  await Promise.all(groups.map((group) => mergeGroup(meetingId, provider, group)));
}

// Fire-and-forget from the capture path: once a speaker's turn is closed (a different
// speaker takes over, or a long-enough pause), stitch its consecutive same-speaker
// fragments that form one sentence into a single merged row, keeping (and hiding) the
// originals. Serialized per meeting; a no-op unless correction is enabled on /settings; any
// failure is logged and swallowed so it never disrupts capture. Pass `{ final: true }` on
// meeting end to also stitch the still-open trailing turn — the final pass waits for any
// in-flight live run rather than dropping it (so the tail is never missed).
export async function maybeCorrectTranscript(
  meetingId: string,
  options: { final?: boolean; settings?: AiProviderSettings | null } = {},
): Promise<void> {
  if (options.final) {
    // The final pass must run; drain any in-flight live run first. Capture has already
    // been stopped before the final pass, so no new live runs start and this terminates.
    let running = inFlight.get(meetingId);
    while (running) {
      await running.catch(() => undefined);
      running = inFlight.get(meetingId);
    }
  } else if (inFlight.get(meetingId)) {
    // A run is already active for this meeting; drop this live tick. (No await between the
    // check and the claim below, so the two capture channels can't both pass.)
    return;
  }

  const run = runCorrection(meetingId, options).catch((error) => {
    console.error(`transcript correction failed for ${meetingId}:`, error);
  });
  inFlight.set(meetingId, run);
  try {
    await run;
  } finally {
    if (inFlight.get(meetingId) === run) {
      inFlight.delete(meetingId);
    }
  }
}
