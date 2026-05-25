import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createMeetingSessionSchema } from "@teams-observer/core";
import { prisma } from "@teams-observer/db";
import { getOrCreateDefaultTenant } from "../../../lib/tenant";

export async function GET(): Promise<Response> {
  const meetings = await prisma.meetingSession.findMany({
    include: {
      source: true,
      _count: { select: { utterances: true, insights: true, summaries: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ meetings });
}

export async function POST(request: Request): Promise<Response> {
  const input = createMeetingSessionSchema.parse(await request.json());
  const tenant = await getOrCreateDefaultTenant();

  if (input.sourceId) {
    const source = await prisma.monitoredSource.findUnique({ where: { id: input.sourceId } });
    if (!source) {
      return NextResponse.json({ error: "Linked source was not found." }, { status: 404 });
    }
  }

  const meeting = await prisma.meetingSession.create({
    data: {
      tenantId: tenant.id,
      sourceId: input.sourceId,
      title: input.title,
      platform: input.platform,
      externalContextId: input.externalContextId,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "meeting.started",
      targetType: "MeetingSession",
      targetId: meeting.id,
      metadata: { platform: meeting.platform, sourceId: meeting.sourceId },
    },
  });

  revalidatePath("/meetings");
  return NextResponse.json({ meeting }, { status: 201 });
}
