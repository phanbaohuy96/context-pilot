import { NextResponse } from "next/server";
import { prisma } from "@context-pilot/db";
import { getCaptureStatus, startCapture, stopCapture } from "../../../../../lib/capture/manager";

export const dynamic = "force-dynamic";

type CaptureRouteContext = {
  params: Promise<{ meetingId: string }>;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(_request: Request, { params }: CaptureRouteContext): Promise<Response> {
  const { meetingId } = await params;
  return NextResponse.json({ capture: getCaptureStatus(meetingId) });
}

export async function POST(request: Request, { params }: CaptureRouteContext): Promise<Response> {
  const { meetingId } = await params;
  const meeting = await prisma.meetingSession.findUnique({ where: { id: meetingId } });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting session was not found." }, { status: 404 });
  }
  if (meeting.status === "ENDED") {
    return NextResponse.json({ error: "Cannot capture audio for an ended meeting." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const capture = await startCapture(meetingId, {
      mic: optionalString(body.mic),
      meeting: optionalString(body.meeting),
    });
    return NextResponse.json({ capture }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start capture.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: CaptureRouteContext): Promise<Response> {
  const { meetingId } = await params;
  await stopCapture(meetingId);
  return NextResponse.json({ capture: null });
}
