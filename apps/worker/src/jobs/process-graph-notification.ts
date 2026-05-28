import type { Job } from "bullmq";
import { Prisma } from "@prisma/client";
import {
  assertSourceCanIngest,
  queueNames,
  validateClientState,
  type GraphNotificationJobData,
} from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import { normalizeGraphChatMessage, resolveMessageIdFromNotification } from "@context-pilot/graph";
import { getGraphClient, requiredEnv } from "../lib/env";
import { createSummarizeThreadQueue } from "../lib/queues";

export async function processGraphNotificationJob(job: Job<GraphNotificationJobData>): Promise<void> {
  const expectedClientState = requiredEnv("GRAPH_CLIENT_STATE");
  if (!validateClientState(job.data.clientState, expectedClientState)) {
    throw new Error("Graph notification clientState validation failed.");
  }

  const subscription = await prisma.graphSubscription.findUnique({
    where: { graphSubscriptionId: job.data.subscriptionId },
    include: { source: true },
  });

  if (!subscription) {
    throw new Error(`Graph subscription ${job.data.subscriptionId} is not registered.`);
  }

  assertSourceCanIngest(subscription.source);

  const messageId = resolveMessageIdFromNotification(job.data.resource, job.data.resourceDataId);
  if (!messageId) {
    throw new Error(`Could not resolve message id from Graph resource ${job.data.resource}.`);
  }

  const graph = getGraphClient();
  const rawMessage = subscription.source.sourceType === "TEAM_CHANNEL"
    ? await graph.getChannelMessage({
        teamId: subscription.source.teamId!,
        channelId: subscription.source.channelId!,
        messageId,
      })
    : await graph.getChatMessage({
        chatId: subscription.source.chatId!,
        messageId,
      });

  const normalized = normalizeGraphChatMessage(rawMessage);

  const message = await prisma.message.upsert({
    where: {
      sourceId_externalId: {
        sourceId: subscription.sourceId,
        externalId: normalized.externalId,
      },
    },
    update: {
      threadId: normalized.threadId,
      replyToId: normalized.replyToId,
      senderName: normalized.senderName,
      senderId: normalized.senderId,
      subject: normalized.subject,
      contentHtml: normalized.contentHtml,
      contentText: normalized.contentText,
      webUrl: normalized.webUrl,
      createdAt: normalized.createdAt,
      rawJson: normalized.rawJson as Prisma.InputJsonValue,
    },
    create: {
      sourceId: subscription.sourceId,
      externalId: normalized.externalId,
      threadId: normalized.threadId,
      replyToId: normalized.replyToId,
      senderName: normalized.senderName,
      senderId: normalized.senderId,
      subject: normalized.subject,
      contentHtml: normalized.contentHtml,
      contentText: normalized.contentText,
      webUrl: normalized.webUrl,
      createdAt: normalized.createdAt,
      rawJson: normalized.rawJson as Prisma.InputJsonValue,
    },
  });

  await prisma.graphSubscription.update({
    where: { id: subscription.id },
    data: { lastNotificationAt: new Date(), status: "ACTIVE", lastError: null },
  });

  const summarizeQueue = createSummarizeThreadQueue();
  await summarizeQueue.add(queueNames.summarizeThread, {
    sourceId: subscription.sourceId,
    threadId: message.threadId,
    provider: "LOCAL_OPENAI",
  });
}
