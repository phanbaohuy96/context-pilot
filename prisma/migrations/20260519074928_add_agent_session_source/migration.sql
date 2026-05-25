-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN     "sourceId" TEXT;

-- CreateIndex
CREATE INDEX "AgentSession_sourceId_createdAt_idx" ON "AgentSession"("sourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MonitoredSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
