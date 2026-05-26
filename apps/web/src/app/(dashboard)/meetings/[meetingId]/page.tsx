import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@teams-observer/db";
import { stopCapture } from "../../../../lib/capture/manager";
import { LiveMeetingWorkspace } from "../../../../components/LiveMeetingWorkspace";

export const dynamic = "force-dynamic";

type MeetingWorkspacePageProps = {
  params: Promise<{ meetingId: string }>;
};

async function endMeeting(formData: FormData) {
  "use server";

  const meetingId = String(formData.get("meetingId") ?? "");
  const meeting = await prisma.meetingSession.findUnique({ where: { id: meetingId } });

  if (!meeting || meeting.status === "ENDED") {
    return;
  }

  await stopCapture(meeting.id);

  const endedAt = new Date();
  await prisma.meetingSession.update({
    where: { id: meeting.id },
    data: { status: "ENDED", endedAt },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: meeting.tenantId,
      action: "meeting.ended",
      targetType: "MeetingSession",
      targetId: meeting.id,
      metadata: { platform: meeting.platform, startedAt: meeting.startedAt, endedAt },
    },
  });

  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meeting.id}`);
}

export default async function MeetingWorkspacePage({ params }: MeetingWorkspacePageProps) {
  const { meetingId } = await params;
  const meeting = await prisma.meetingSession.findUnique({
    where: { id: meetingId },
    include: {
      source: true,
      // Most recent window (desc) so a long meeting keeps its latest lines; restored
      // to chronological order below for the transcript view.
      utterances: { orderBy: { startedAt: "desc" }, take: 1000 },
      insights: { orderBy: { createdAt: "desc" }, take: 50 },
      summaries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!meeting) {
    notFound();
  }

  meeting.utterances.reverse();

  return (
    <>
      <header className="page-header meeting-header">
        <div>
          <h2>{meeting.title}</h2>
          <p>Listen to any meeting provider, show live captions, capture notes, and suggest private replies.</p>
        </div>
        <form action={endMeeting}>
          <input type="hidden" name="meetingId" value={meeting.id} />
          <button className="danger" type="submit" disabled={meeting.status === "ENDED"}>End session</button>
        </form>
      </header>

      <section className="card session-strip">
        <p><strong>Status</strong><br /><span className={meeting.status === "ACTIVE" ? "badge success" : "badge"}>{meeting.status}</span></p>
        <p><strong>Provider</strong><br /><span className="badge">{meeting.platform}</span></p>
        <p><strong>Started</strong><br />{meeting.startedAt.toISOString()}</p>
        <p><strong>Audio source</strong><br />{meeting.externalContextId ?? "macOS mic + meeting audio"}</p>
        <p><strong>Linked source</strong><br />{meeting.source?.displayName ?? "None"}</p>
      </section>

      <LiveMeetingWorkspace
        meetingId={meeting.id}
        status={meeting.status}
        initialUtterances={meeting.utterances.map((utterance) => ({
          id: utterance.id,
          speakerRole: utterance.speakerRole,
          sourceChannel: utterance.sourceChannel,
          startedAt: utterance.startedAt.toISOString(),
          text: utterance.text,
          interim: (utterance.engineMetadata as { interim?: boolean } | null)?.interim === true,
          speakerLabel: (utterance.engineMetadata as { speakerLabel?: string } | null)?.speakerLabel,
        }))}
        initialInsights={meeting.insights.map((insight) => ({
          id: insight.id,
          kind: insight.kind,
          text: insight.text,
          keywords: insight.keywords,
          createdAt: insight.createdAt.toISOString(),
        }))}
        initialSummaries={meeting.summaries.map((summary) => ({
          id: summary.id,
          summary: summary.summary,
          openQuestions: summary.openQuestions,
          actionItems: summary.actionItems,
          model: summary.model,
          createdAt: summary.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
