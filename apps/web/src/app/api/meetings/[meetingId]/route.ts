import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { updateMeetingSessionSchema } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import { stopCapture } from "../../../../lib/capture/manager";
import { maybeCorrectTranscript } from "../../../../lib/meeting-correction";
import { TRANSCRIPT_FETCH_WINDOW, visibleTranscriptWindow } from "../../../../lib/meeting-utterances";

export const dynamic = "force-dynamic";

type MeetingRouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function GET(_request: Request, { params }: MeetingRouteContext): Promise<Response> {
  const { meetingId } = await params;
  const meeting = await prisma.meetingSession.findUnique({
    where: { id: meetingId },
    include: {
      source: true,
      context: { select: { briefing: true, agendaItems: true, openQuestions: true, risks: true, keywords: true } },
      // Fetch a wider recent window (desc) so that after correction-superseded rows are
      // dropped the live caption is never lost on a long meeting; restore chronological
      // order for the client.
      utterances: { orderBy: { startedAt: "desc" }, take: TRANSCRIPT_FETCH_WINDOW },
      insights: { orderBy: { createdAt: "desc" }, take: 50 },
      summaries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting session was not found." }, { status: 404 });
  }

  meeting.utterances = visibleTranscriptWindow(meeting.utterances);
  meeting.utterances.reverse();
  return NextResponse.json({ meeting });
}

export async function PATCH(request: Request, { params }: MeetingRouteContext): Promise<Response> {
  const { meetingId } = await params;
  const input = updateMeetingSessionSchema.parse(await request.json());
  const existing = await prisma.meetingSession.findUnique({ where: { id: meetingId } });

  if (!existing) {
    return NextResponse.json({ error: "Meeting session was not found." }, { status: 404 });
  }

  const endedAt = input.endedAt ?? (input.status === "ENDED" && !existing.endedAt ? new Date() : undefined);
  const meeting = await prisma.meetingSession.update({
    where: { id: meetingId },
    data: {
      status: input.status,
      endedAt,
    },
  });

  if (input.status === "ENDED") {
    await prisma.auditLog.create({
      data: {
        tenantId: meeting.tenantId,
        action: "meeting.ended",
        targetType: "MeetingSession",
        targetId: meeting.id,
        metadata: { platform: meeting.platform, startedAt: meeting.startedAt, endedAt: meeting.endedAt },
      },
    });
    // Stop capture first so no new live correction runs start while the final pass drains —
    // the final pass relies on capture being stopped to terminate (mirrors the /meetings
    // end-session server action).
    await stopCapture(meeting.id);
    // Final stitch pass: merge any fragments left at the tail of the meeting (the live
    // pass skips the most recent utterance). No-op unless correction is enabled; it
    // swallows its own errors, so a provider failure never blocks ending the meeting.
    await maybeCorrectTranscript(meeting.id, { final: true });
  }

  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meeting.id}`);
  return NextResponse.json({ meeting });
}
