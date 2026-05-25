import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { updateMeetingSessionSchema } from "@teams-observer/core";
import { prisma } from "@teams-observer/db";

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
      // Fetch the most recent window (desc) so the live caption is never dropped on a
      // long meeting, then restore chronological order for the client.
      utterances: { orderBy: { startedAt: "desc" }, take: 1000 },
      insights: { orderBy: { createdAt: "desc" }, take: 50 },
      summaries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting session was not found." }, { status: 404 });
  }

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
  }

  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meeting.id}`);
  return NextResponse.json({ meeting });
}
