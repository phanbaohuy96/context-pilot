import { NextResponse } from "next/server";
import { assistInsightDisplayText } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import {
  TRANSLATE_TARGET_LANG_CODE,
  translateToVietnamese,
} from "../../../../../../../lib/meeting-translation";

export const dynamic = "force-dynamic";

type TranslateRouteContext = {
  params: Promise<{ meetingId: string; insightId: string }>;
};

// Translate a single assist-card insight to Vietnamese on demand. We translate the card's
// *display* text (the detector's label prefix stripped) so the cache key matches exactly what
// the UI shows; everything else (caching, provider, concurrency-safe write) is shared.
export async function POST(_request: Request, { params }: TranslateRouteContext): Promise<Response> {
  const { meetingId, insightId } = await params;
  const insight = await prisma.meetingInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.meetingSessionId !== meetingId) {
    return NextResponse.json({ error: "Insight was not found." }, { status: 404 });
  }

  const out = await translateToVietnamese({
    source: assistInsightDisplayText(insight.kind, insight.text),
    cachedMetadata: insight.engineMetadata,
    resolveTenantId: async () =>
      (await prisma.meetingSession.findUnique({ where: { id: meetingId } }))?.tenantId ?? null,
    writeFresh: async (apply) => {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.meetingInsight.findUnique({ where: { id: insight.id } });
        if (!fresh) {
          return;
        }
        await tx.meetingInsight.update({
          where: { id: insight.id },
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
