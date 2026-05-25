import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ingestTranscriptUtteranceSchema } from "@teams-observer/core";
import { prisma } from "@teams-observer/db";
import { createDeterministicMeetingInsights } from "../../../../../lib/meeting-insights";

export const dynamic = "force-dynamic";

type UtteranceRouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function GET(_request: Request, { params }: UtteranceRouteContext): Promise<Response> {
  const { meetingId } = await params;
  // Most recent window (desc) so a long meeting isn't truncated to its oldest lines,
  // then restored to chronological order for the response.
  const utterances = await prisma.transcriptUtterance.findMany({
    where: { meetingSessionId: meetingId },
    orderBy: { startedAt: "desc" },
    take: 1000,
  });
  utterances.reverse();

  return NextResponse.json({ utterances });
}

export async function POST(request: Request, { params }: UtteranceRouteContext): Promise<Response> {
  const { meetingId } = await params;
  const input = ingestTranscriptUtteranceSchema.parse(await request.json());
  const meeting = await prisma.meetingSession.findUnique({ where: { id: meetingId } });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting session was not found." }, { status: 404 });
  }

  if (meeting.status === "ENDED") {
    return NextResponse.json({ error: "Cannot add transcript utterances to an ended meeting." }, { status: 409 });
  }

  const startedAt = input.startedAt ?? new Date();
  const engineMetadata: Prisma.InputJsonValue | undefined = input.engineMetadata == null
    ? undefined
    : input.engineMetadata as Prisma.InputJsonValue;
  const utterance = await prisma.transcriptUtterance.create({
    data: {
      meetingSessionId: meeting.id,
      speakerRole: input.speakerRole,
      sourceChannel: input.sourceChannel,
      startedAt,
      endedAt: input.endedAt,
      text: input.text,
      confidence: input.confidence,
      engineMetadata,
    },
  });

  await createDeterministicMeetingInsights({
    meetingSessionId: meeting.id,
    utteranceId: utterance.id,
    speakerRole: utterance.speakerRole,
    text: utterance.text,
  });

  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meeting.id}`);
  return NextResponse.json({ utterance }, { status: 201 });
}
