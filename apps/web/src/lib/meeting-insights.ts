import { detectMeetingAssistInsights } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import type { MeetingSpeakerRole } from "@prisma/client";
import { preparedContextFromRecord } from "./meeting-context";

export async function createDeterministicMeetingInsights(input: {
  meetingSessionId: string;
  utteranceId: string;
  speakerRole: MeetingSpeakerRole;
  text: string;
  userName?: string;
}): Promise<void> {
  const meeting = await prisma.meetingSession.findUnique({
    where: { id: input.meetingSessionId },
    include: {
      context: { select: { briefing: true, agendaItems: true, openQuestions: true, risks: true, keywords: true } },
    },
  });
  const insights = detectMeetingAssistInsights({
    utteranceId: input.utteranceId,
    speakerRole: input.speakerRole,
    text: input.text,
    userName: input.userName,
    context: preparedContextFromRecord(meeting?.context),
  });

  if (!insights.length) {
    return;
  }

  await prisma.meetingInsight.createMany({
    data: insights.map((insight) => ({
      meetingSessionId: input.meetingSessionId,
      kind: insight.kind,
      text: insight.text,
      keywords: insight.keywords,
      relatedUtteranceIds: insight.relatedUtteranceIds,
      confidence: insight.confidence,
    })),
  });
}
