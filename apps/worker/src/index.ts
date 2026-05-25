import "dotenv/config";
import { processGraphNotificationJob } from "./jobs/process-graph-notification";
import { renewGraphSubscriptions } from "./jobs/renew-graph-subscriptions";
import { summarizeThreadJob } from "./jobs/summarize-thread";
import { createGraphNotificationWorker, createSummarizeThreadWorker } from "./lib/queues";

const workers = [
  createGraphNotificationWorker(processGraphNotificationJob),
  createSummarizeThreadWorker(summarizeThreadJob),
];

for (const worker of workers) {
  worker.on("completed", (job) => {
    console.log(`Completed ${worker.name} job ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Failed ${worker.name} job ${job?.id}:`, error);
  });
}

renewGraphSubscriptions().catch((error) => {
  console.error("Initial subscription renewal failed:", error);
});

const renewalInterval = setInterval(() => {
  renewGraphSubscriptions().catch((error) => {
    console.error("Scheduled subscription renewal failed:", error);
  });
}, 5 * 60 * 1000);

async function shutdown(): Promise<void> {
  clearInterval(renewalInterval);
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

console.log("Teams Discovery Observer worker started.");
