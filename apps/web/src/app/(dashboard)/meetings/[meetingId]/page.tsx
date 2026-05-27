import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { speakerAliasFromMetadata, speakerKeyFromMetadata, speakerLabelFromMetadata } from "@teams-observer/core";
import { prisma } from "@teams-observer/db";
import { stopCapture } from "../../../../lib/capture/manager";
import { LiveMeetingWorkspace } from "../../../../components/LiveMeetingWorkspace";
import { importedMediaFileName } from "../../../../lib/imported-diarization";

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
    <LiveMeetingWorkspace
      meetingId={meeting.id}
      title={meeting.title}
      status={meeting.status}
      platform={meeting.platform}
      startedLabel={meeting.startedAt.toISOString().slice(0, 16).replace("T", " ")}
      audioSource={meeting.externalContextId ?? "mic + meeting audio"}
      linkedSource={meeting.source?.displayName ?? null}
      importMediaFile={importedMediaFileName(meeting.externalContextId)}
      headerAction={(
        <form action={endMeeting}>
          <input type="hidden" name="meetingId" value={meeting.id} />
          <button className="danger" type="submit" disabled={meeting.status === "ENDED"}>End session</button>
        </form>
      )}
      initialUtterances={meeting.utterances.map((utterance) => ({
        id: utterance.id,
        speakerRole: utterance.speakerRole,
        sourceChannel: utterance.sourceChannel,
        startedAt: utterance.startedAt.toISOString(),
        text: utterance.text,
        interim: (utterance.engineMetadata as { interim?: boolean } | null)?.interim === true,
        speakerKey: speakerKeyFromMetadata(utterance.engineMetadata),
        speakerLabel: speakerLabelFromMetadata(utterance.engineMetadata),
        speakerAlias: speakerAliasFromMetadata(utterance.engineMetadata),
      }))}
      initialInsights={meeting.insights.map((insight) => ({
        id: insight.id,
        kind: insight.kind,
        text: insight.text,
        keywords: insight.keywords,
        relatedUtteranceIds: insight.relatedUtteranceIds,
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
  );
}
