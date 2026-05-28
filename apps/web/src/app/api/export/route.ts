import { NextResponse } from "next/server";
import { prisma } from "@context-pilot/db";

export async function GET(): Promise<Response> {
  const [requirements, summaries, messages] = await Promise.all([
    prisma.requirement.findMany({
      where: { status: { not: "REJECTED" } },
      include: { source: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.threadSummary.findMany({
      include: { source: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.findMany({
      include: { source: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    requirements: requirements.map((requirement) => ({
      id: requirement.id,
      source: requirement.source.displayName,
      category: requirement.category,
      status: requirement.status,
      title: requirement.title,
      description: requirement.description,
      priority: requirement.priority,
      evidenceMessageIds: requirement.evidenceMessageIds,
    })),
    summaries: summaries.map((summary) => ({
      id: summary.id,
      source: summary.source.displayName,
      threadId: summary.threadId,
      summary: summary.summary,
      evidenceMessageIds: summary.evidenceMessageIds,
    })),
    messages: messages.map((message) => ({
      id: message.id,
      source: message.source.displayName,
      threadId: message.threadId,
      senderName: message.senderName,
      createdAt: message.createdAt,
      contentText: message.contentText,
    })),
  });
}
