import { NextResponse } from "next/server";
import { isInterimMetadata, supersededByFromMetadata } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import {
  TRANSLATE_TARGET_LANG_CODE,
  translateToVietnamese,
} from "../../../../../../../lib/meeting-translation";

// How many preceding visible transcript lines to pass as translation context.
const TRANSLATION_CONTEXT_LINES = 3;

export const dynamic = "force-dynamic";

type TranslateRouteContext = {
  params: Promise<{ meetingId: string; utteranceId: string }>;
};

// Translate a single transcript utterance to Vietnamese on demand. Caching, provider
// resolution, and the concurrency-safe write live in the shared translateToVietnamese helper;
// this route only supplies the utterance's source text and how to persist onto its row.
export async function POST(_request: Request, { params }: TranslateRouteContext): Promise<Response> {
  const { meetingId, utteranceId } = await params;
  const utterance = await prisma.transcriptUtterance.findUnique({ where: { id: utteranceId } });
  if (!utterance || utterance.meetingSessionId !== meetingId) {
    return NextResponse.json({ error: "Utterance was not found." }, { status: 404 });
  }

  const out = await translateToVietnamese({
    source: utterance.text,
    cachedMetadata: utterance.engineMetadata,
    resolveTenantId: async () =>
      (await prisma.meetingSession.findUnique({ where: { id: meetingId } }))?.tenantId ?? null,
    resolveContext: async () => {
      // The few preceding visible lines, oldest-first — context the isolated line lacks.
      const preceding = await prisma.transcriptUtterance.findMany({
        where: { meetingSessionId: meetingId, startedAt: { lt: utterance.startedAt } },
        orderBy: { startedAt: "desc" },
        take: TRANSLATION_CONTEXT_LINES * 2,
      });
      return preceding
        .filter(
          (row) =>
            row.text.trim() &&
            !isInterimMetadata(row.engineMetadata) &&
            !supersededByFromMetadata(row.engineMetadata),
        )
        .slice(0, TRANSLATION_CONTEXT_LINES)
        .reverse()
        .map((row) => row.text.trim());
    },
    writeFresh: async (apply) => {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.transcriptUtterance.findUnique({ where: { id: utterance.id } });
        if (!fresh) {
          return;
        }
        await tx.transcriptUtterance.update({
          where: { id: utterance.id },
          data: { engineMetadata: apply(fresh.engineMetadata) },
        });
      });
    },
  });

  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ translation: { lang: TRANSLATE_TARGET_LANG_CODE, text: out.text } });
}
