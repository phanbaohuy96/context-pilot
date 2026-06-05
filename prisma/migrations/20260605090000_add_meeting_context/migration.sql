-- CreateTable
CREATE TABLE "MeetingContext" (
    "id" TEXT NOT NULL,
    "meetingSessionId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "sourceMimeType" TEXT,
    "briefing" TEXT NOT NULL DEFAULT '',
    "agendaItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" "AiProviderKind",
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingContext_meetingSessionId_key" ON "MeetingContext"("meetingSessionId");

-- CreateIndex
CREATE INDEX "MeetingContext_meetingSessionId_idx" ON "MeetingContext"("meetingSessionId");

-- AddForeignKey
ALTER TABLE "MeetingContext" ADD CONSTRAINT "MeetingContext_meetingSessionId_fkey" FOREIGN KEY ("meetingSessionId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
