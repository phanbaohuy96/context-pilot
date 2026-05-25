-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('TEAM_CHANNEL', 'GROUP_CHAT', 'CHAT');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('PENDING', 'APPROVED', 'PAUSED', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRING', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "RequirementCategory" AS ENUM ('BUSINESS_GOAL', 'USER_ROLE', 'WORKFLOW', 'FEATURE', 'CONSTRAINT', 'OPEN_QUESTION', 'RISK', 'ASSUMPTION');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NEW', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('LOCAL_OPENAI', 'CLAUDE_CODE_CLI');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "azureTenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "entraObjectId" TEXT,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scopes" TEXT[],
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "rawJson" JSONB,

    CONSTRAINT "ConsentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'PENDING',
    "displayName" TEXT NOT NULL,
    "teamId" TEXT,
    "channelId" TEXT,
    "chatId" TEXT,
    "graphResource" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSubscription" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "graphSubscriptionId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "changeType" TEXT NOT NULL DEFAULT 'created,updated',
    "notificationUrl" TEXT NOT NULL,
    "clientStateHash" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastNotificationAt" TIMESTAMP(3),
    "lastRenewedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "replyToId" TEXT,
    "senderName" TEXT,
    "senderId" TEXT,
    "subject" TEXT,
    "contentHtml" TEXT,
    "contentText" TEXT NOT NULL,
    "webUrl" TEXT,
    "sensitivityLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadSummary" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidenceMessageIds" TEXT[],
    "provider" "AiProviderKind" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "category" "RequirementCategory" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceMessageIds" TEXT[],
    "priority" TEXT,
    "notes" TEXT,
    "provider" "AiProviderKind",
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "provider" "AiProviderKind" NOT NULL,
    "model" TEXT NOT NULL,
    "contextSummary" TEXT,
    "evidenceMessageIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_azureTenantId_key" ON "Tenant"("azureTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_entraObjectId_key" ON "User"("entraObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MonitoredSource_tenantId_status_idx" ON "MonitoredSource"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MonitoredSource_sourceType_teamId_channelId_chatId_idx" ON "MonitoredSource"("sourceType", "teamId", "channelId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphSubscription_graphSubscriptionId_key" ON "GraphSubscription"("graphSubscriptionId");

-- CreateIndex
CREATE INDEX "GraphSubscription_sourceId_status_idx" ON "GraphSubscription"("sourceId", "status");

-- CreateIndex
CREATE INDEX "GraphSubscription_expiresAt_idx" ON "GraphSubscription"("expiresAt");

-- CreateIndex
CREATE INDEX "Message_sourceId_threadId_idx" ON "Message"("sourceId", "threadId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_sourceId_externalId_key" ON "Message"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "ThreadSummary_sourceId_threadId_idx" ON "ThreadSummary"("sourceId", "threadId");

-- CreateIndex
CREATE INDEX "Requirement_sourceId_status_idx" ON "Requirement"("sourceId", "status");

-- CreateIndex
CREATE INDEX "Requirement_category_idx" ON "Requirement"("category");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "ConsentGrant" ADD CONSTRAINT "ConsentGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredSource" ADD CONSTRAINT "MonitoredSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredSource" ADD CONSTRAINT "MonitoredSource_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSubscription" ADD CONSTRAINT "GraphSubscription_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MonitoredSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MonitoredSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadSummary" ADD CONSTRAINT "ThreadSummary_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MonitoredSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MonitoredSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
