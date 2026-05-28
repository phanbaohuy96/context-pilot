import type { Job } from "bullmq";
import { createAiProvider, promptVersion } from "@context-pilot/ai";
import type { SummarizeThreadJobData } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";

export async function summarizeThreadJob(job: Job<SummarizeThreadJobData>): Promise<void> {
  const source = await prisma.monitoredSource.findUnique({ where: { id: job.data.sourceId } });
  if (!source) {
    throw new Error(`Source ${job.data.sourceId} not found.`);
  }

  const messages = await prisma.message.findMany({
    where: {
      sourceId: job.data.sourceId,
      threadId: job.data.threadId,
    },
    orderBy: { createdAt: "asc" },
    take: 80,
  });

  if (!messages.length) {
    return;
  }

  const context = {
    messages: messages.map((message) => ({
      id: message.id,
      sourceName: source.displayName,
      senderName: message.senderName,
      createdAt: message.createdAt,
      contentText: message.contentText,
    })),
  };

  const provider = createAiProvider(job.data.provider);
  const summary = await provider.summarizeThread(context);

  const savedSummary = await prisma.threadSummary.create({
    data: {
      sourceId: source.id,
      threadId: job.data.threadId,
      summary: summary.summary,
      evidenceMessageIds: summary.evidenceMessageIds,
      provider: provider.kind,
      model: summary.model,
      promptVersion,
      confidence: summary.confidence,
    },
  });

  const extraction = await provider.extractRequirements({
    ...context,
    summaries: [
      {
        id: savedSummary.id,
        threadId: savedSummary.threadId,
        summary: savedSummary.summary,
        evidenceMessageIds: savedSummary.evidenceMessageIds,
      },
    ],
  });

  if (extraction.requirements.length) {
    await prisma.requirement.createMany({
      data: extraction.requirements.map((requirement) => ({
        sourceId: source.id,
        category: requirement.category,
        title: requirement.title,
        description: requirement.description,
        priority: requirement.priority,
        evidenceMessageIds: requirement.evidenceMessageIds,
        provider: provider.kind,
        model: extraction.model,
      })),
    });
  }
}
