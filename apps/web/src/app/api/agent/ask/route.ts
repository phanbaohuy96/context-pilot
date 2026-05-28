import { NextResponse } from "next/server";
import { z } from "zod";
import { createAiProvider } from "@context-pilot/ai";
import { prisma } from "@context-pilot/db";

const askSchema = z.object({
  question: z.string().min(1).max(2000),
  provider: z.enum(["LOCAL_OPENAI", "CLAUDE_CODE_CLI"]).default("LOCAL_OPENAI"),
  sourceId: z.string().min(1).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const body = askSchema.parse(await request.json());
  const sourceFilter = body.sourceId ? { sourceId: body.sourceId } : {};

  if (body.sourceId) {
    const source = await prisma.monitoredSource.findUnique({ where: { id: body.sourceId } });
    if (!source) {
      return NextResponse.json({ error: "Selected chat source was not found." }, { status: 404 });
    }
  }

  const [messages, summaries, requirements] = await Promise.all([
    prisma.message.findMany({
      where: sourceFilter,
      include: { source: true },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.threadSummary.findMany({
      where: sourceFilter,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.requirement.findMany({
      where: { ...sourceFilter, status: { not: "REJECTED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const provider = createAiProvider(body.provider);

  try {
    const answer = await provider.answerQuestion({
      question: body.question,
      messages: messages.reverse().map((message) => ({
        id: message.id,
        sourceName: message.source.displayName,
        senderName: message.senderName,
        createdAt: message.createdAt,
        contentText: message.contentText,
      })),
      summaries: summaries.map((summary) => ({
        id: summary.id,
        threadId: summary.threadId,
        summary: summary.summary,
        evidenceMessageIds: summary.evidenceMessageIds,
      })),
      requirements: requirements.map((requirement) => ({
        id: requirement.id,
        title: requirement.title,
        description: requirement.description,
        category: requirement.category,
        evidenceMessageIds: requirement.evidenceMessageIds,
      })),
    });

    await prisma.agentSession.create({
      data: {
        sourceId: body.sourceId,
        question: body.question,
        answer: answer.answer,
        provider: provider.kind,
        model: answer.model,
        evidenceMessageIds: answer.evidenceMessageIds,
      },
    });

    return NextResponse.json(answer);
  } catch (error) {
    return NextResponse.json(
      { error: providerErrorMessage(error) },
      { status: 502 },
    );
  }
}

function providerErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Agent provider failed.";
  }

  if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
    return "Agent provider is not reachable. Start the selected local AI provider and try again.";
  }

  return error.message;
}
