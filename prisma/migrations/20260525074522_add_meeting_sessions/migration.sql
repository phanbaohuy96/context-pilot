-- CreateEnum
CREATE TYPE "MeetingPlatform" AS ENUM ('TEAMS', 'GOOGLE_MEET', 'ZOOM', 'BROWSER', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('ACTIVE', 'ENDED', 'ERROR');

-- CreateEnum
CREATE TYPE "MeetingSpeakerRole" AS ENUM ('SELF', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MeetingSourceChannel" AS ENUM ('MIC', 'LOOPBACK', 'MIXED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "MeetingInsightKind" AS ENUM ('NOTE', 'QUESTION_FOR_YOU', 'NAME_MENTION', 'ACTION_ITEM', 'ANSWER_SUGGESTION');

-- CreateTable
CREATE TABLE "MeetingSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "platform" "MeetingPlatform" NOT NULL DEFAULT 'OTHER',
    "status" "MeetingStatus" NOT NULL DEFAULT 'ACTIVE',
    "externalContextId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptUtterance" (
    "id" TEXT NOT NULL,
    "meetingSessionId" TEXT NOT NULL,
    "speakerRole" "MeetingSpeakerRole" NOT NULL DEFAULT 'UNKNOWN',
    "sourceChannel" "MeetingSourceChannel" NOT NULL DEFAULT 'MIXED',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "engineMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptUtterance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingInsight" (
    "id" TEXT NOT NULL,
    "meetingSessionId" TEXT NOT NULL,
    "kind" "MeetingInsightKind" NOT NULL,
    "text" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedUtteranceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" "AiProviderKind",
    "model" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSummary" (
    "id" TEXT NOT NULL,
    "meetingSessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "openQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actionItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" "AiProviderKind" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSession_tenantId_status_startedAt_idx" ON "MeetingSession"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "MeetingSession_sourceId_startedAt_idx" ON "MeetingSession"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "TranscriptUtterance_meetingSessionId_startedAt_idx" ON "TranscriptUtterance"("meetingSessionId", "startedAt");

-- CreateIndex
CREATE INDEX "MeetingInsight_meetingSessionId_kind_createdAt_idx" ON "MeetingInsight"("meetingSessionId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingSummary_meetingSessionId_createdAt_idx" ON "MeetingSummary"("meetingSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MonitoredSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptUtterance" ADD CONSTRAINT "TranscriptUtterance_meetingSessionId_fkey" FOREIGN KEY ("meetingSessionId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInsight" ADD CONSTRAINT "MeetingInsight_meetingSessionId_fkey" FOREIGN KEY ("meetingSessionId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSummary" ADD CONSTRAINT "MeetingSummary_meetingSessionId_fkey" FOREIGN KEY ("meetingSessionId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
