import { Queue } from "bullmq";
import IORedis from "ioredis";
import { queueNames, type GraphNotificationJobData, type SummarizeThreadJobData } from "@context-pilot/core";

const globalForQueues = globalThis as unknown as {
  redisConnection?: IORedis;
  graphNotificationsQueue?: Queue<GraphNotificationJobData>;
  summarizeThreadQueue?: Queue<SummarizeThreadJobData>;
};

function getRedisConnection(): IORedis {
  if (!globalForQueues.redisConnection) {
    globalForQueues.redisConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }

  return globalForQueues.redisConnection;
}

export function getGraphNotificationsQueue(): Queue<GraphNotificationJobData> {
  if (!globalForQueues.graphNotificationsQueue) {
    globalForQueues.graphNotificationsQueue = new Queue(queueNames.graphNotifications, {
      connection: getRedisConnection(),
    });
  }

  return globalForQueues.graphNotificationsQueue;
}

export function getSummarizeThreadQueue(): Queue<SummarizeThreadJobData> {
  if (!globalForQueues.summarizeThreadQueue) {
    globalForQueues.summarizeThreadQueue = new Queue(queueNames.summarizeThread, {
      connection: getRedisConnection(),
    });
  }

  return globalForQueues.summarizeThreadQueue;
}
