import { NextResponse } from "next/server";
import { diarizeImportedMeeting, importedMediaFileName } from "../../../../../../lib/imported-diarization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DiarizeRouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function POST(request: Request, { params }: DiarizeRouteContext): Promise<Response> {
  const { meetingId } = await params;
  const body = await request.json().catch(() => ({})) as { mediaFile?: unknown };
  const mediaFile = importedMediaFileName(body.mediaFile);
  if (!mediaFile) {
    return NextResponse.json({ error: "Provide a valid imported media file." }, { status: 400 });
  }
  try {
    const result = await diarizeImportedMeeting(meetingId, mediaFile);
    return NextResponse.json({ diarization: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not diarize imported meeting.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
