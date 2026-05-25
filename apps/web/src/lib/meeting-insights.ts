import { detectMeetingAssistInsights } from "@teams-observer/core";
import { prisma } from "@teams-observer/db";
import type { MeetingSpeakerRole } from "@prisma/client";

export async function createDeterministicMeetingInsights(input: {
  meetingSessionId: string;
  utteranceId: string;
  speakerRole: MeetingSpeakerRole;
  text: string;
  userName?: string;
}): Promise<void> {
  const insights = detectMeetingAssistInsights({
    utteranceId: input.utteranceId,
    speakerRole: input.speakerRole,
    text: input.text,
    userName: input.userName,
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
