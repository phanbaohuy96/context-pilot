import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { metadataWithSpeakerAlias, speakerKeyFromMetadata } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";

export const dynamic = "force-dynamic";

const MAX_ALIAS_LENGTH = 80;

type SpeakerRouteContext = {
  params: Promise<{ meetingId: string }>;
};

function parseAlias(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const alias = value.trim();
  if (alias.length > MAX_ALIAS_LENGTH) {
    return null;
  }
  return alias;
}

export async function PATCH(request: Request, { params }: SpeakerRouteContext): Promise<Response> {
  const { meetingId } = await params;
  const body = await request.json().catch(() => null) as { speakerKey?: unknown; alias?: unknown } | null;
  const speakerKey = typeof body?.speakerKey === "number" && Number.isInteger(body.speakerKey) && body.speakerKey > 0
    ? body.speakerKey
    : null;
  const alias = parseAlias(body?.alias);

  if (!speakerKey || alias == null) {
    return NextResponse.json({ error: "Provide a valid speaker key and alias." }, { status: 400 });
  }

  const meeting = await prisma.meetingSession.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting session was not found." }, { status: 404 });
  }

  const utterances = await prisma.transcriptUtterance.findMany({
    where: { meetingSessionId: meetingId },
  });
  const matching = utterances.filter((utterance) => speakerKeyFromMetadata(utterance.engineMetadata) === speakerKey);

  if (!matching.length) {
    return NextResponse.json({ error: "Speaker was not found in this meeting." }, { status: 404 });
  }

  await prisma.$transaction(
    matching.map((utterance) => prisma.transcriptUtterance.update({
      where: { id: utterance.id },
      data: {
        engineMetadata: metadataWithSpeakerAlias(utterance.engineMetadata, alias) as Prisma.InputJsonValue,
      },
    })),
  );

  return NextResponse.json({ speaker: { key: speakerKey, alias } });
}
