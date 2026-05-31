ALTER TYPE "AiProviderKind" ADD VALUE 'CODEX_CLI';

CREATE TABLE "AiProviderSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "summarizationProvider" "AiProviderKind" NOT NULL DEFAULT 'LOCAL_OPENAI',
    "askAgentProvider" "AiProviderKind" NOT NULL DEFAULT 'LOCAL_OPENAI',
    "meetingNotesProvider" "AiProviderKind" NOT NULL DEFAULT 'LOCAL_OPENAI',
    "localBaseUrl" TEXT,
    "localModel" TEXT,
    "localApiKeyEncrypted" TEXT,
    "claudeCommand" TEXT,
    "claudeWorkdir" TEXT,
    "claudeTimeoutMs" INTEGER,
    "codexCommand" TEXT,
    "codexWorkdir" TEXT,
    "codexModel" TEXT,
    "codexTimeoutMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiProviderSettings_tenantId_key" ON "AiProviderSettings"("tenantId");

ALTER TABLE "AiProviderSettings" ADD CONSTRAINT "AiProviderSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
