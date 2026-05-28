import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import { queueNames, type GraphNotificationJobData, type SummarizeThreadJobData } from "@context-pilot/core";

export function createRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export function createGraphNotificationWorker(
  processor: Processor<GraphNotificationJobData, void, string>,
): Worker<GraphNotificationJobData> {
  return new Worker<GraphNotificationJobData>(queueNames.graphNotifications, processor, {
    connection: createRedisConnection(),
  });
}

export function createSummarizeThreadWorker(
  processor: Processor<SummarizeThreadJobData, void, string>,
): Worker<SummarizeThreadJobData> {
  return new Worker<SummarizeThreadJobData>(queueNames.summarizeThread, processor, {
    connection: createRedisConnection(),
  });
}

export function createSummarizeThreadQueue(): Queue<SummarizeThreadJobData> {
  return new Queue<SummarizeThreadJobData>(queueNames.summarizeThread, {
    connection: createRedisConnection(),
  });
}
