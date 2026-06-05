import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createMeetingSessionSchema, type CreateMeetingSessionInput } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import {
  createMeetingContext,
  meetingContextDraftFromFormData,
  meetingContextDraftFromJson,
  prepareMeetingContext,
} from "../../../lib/meeting-context";
import { getOrCreateDefaultTenant } from "../../../lib/tenant";

export async function GET(): Promise<Response> {
  const meetings = await prisma.meetingSession.findMany({
    include: {
      source: true,
      context: { select: { briefing: true, agendaItems: true, openQuestions: true, risks: true, keywords: true } },
      _count: { select: { utterances: true, insights: true, summaries: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ meetings });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseCreateMeetingRequest(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { input, contextDraft } = parsed;
  const tenant = await getOrCreateDefaultTenant();

  if (input.sourceId) {
    const source = await prisma.monitoredSource.findUnique({ where: { id: input.sourceId } });
    if (!source) {
      return NextResponse.json({ error: "Linked source was not found." }, { status: 404 });
    }
  }

  const preparedContext = await prepareMeetingContext({
    tenantId: tenant.id,
    title: input.title,
    draft: contextDraft,
  });
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
  await createMeetingContext({
    meetingSessionId: meeting.id,
    draft: contextDraft,
    prepared: preparedContext,
  });

  revalidatePath("/meetings");
  return NextResponse.json({ meeting }, { status: 201 });
}

async function parseCreateMeetingRequest(request: Request): Promise<
  | { input: CreateMeetingSessionInput; contextDraft?: Awaited<ReturnType<typeof meetingContextDraftFromJson>> }
  | { error: string }
> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const input = createMeetingSessionSchema.parse({
        title: formData.get("title"),
        platform: formData.get("platform"),
        sourceId: emptyToUndefined(formData.get("sourceId")),
        externalContextId: emptyToUndefined(formData.get("externalContextId")),
        contextText: emptyToUndefined(formData.get("contextText")),
      });
      return { input, contextDraft: await meetingContextDraftFromFormData(formData) };
    }
    const raw = await request.json();
    const input = createMeetingSessionSchema.parse(raw);
    return { input, contextDraft: await meetingContextDraftFromJson(input) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid meeting session input." };
  }
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}
