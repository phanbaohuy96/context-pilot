import { prisma } from "@context-pilot/db";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const [requirements, summaries, agentSessions] = await Promise.all([
    prisma.requirement.findMany({
      where: { status: { not: "REJECTED" } },
      include: { source: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.threadSummary.findMany({
      include: { source: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.agentSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const exportPreview = {
    generatedAt: new Date().toISOString(),
    requirements: requirements.map((requirement) => ({
      title: requirement.title,
      description: requirement.description,
      category: requirement.category,
      status: requirement.status,
      source: requirement.source.displayName,
      evidenceMessageIds: requirement.evidenceMessageIds,
    })),
    summaries: summaries.map((summary) => ({
      source: summary.source.displayName,
      threadId: summary.threadId,
      summary: summary.summary,
      evidenceMessageIds: summary.evidenceMessageIds,
    })),
    recentAgentQuestions: agentSessions.map((session) => ({
      question: session.question,
      answer: session.answer,
      evidenceMessageIds: session.evidenceMessageIds,
    })),
  };

  return (
    <>
      <header className="page-header">
        <h2>Quoting export</h2>
        <p>Export reviewed discovery evidence, summaries, assumptions, risks, and open questions.</p>
      </header>

      <section className="card stack">
        <a className="button" href="/api/export" target="_blank">Download JSON export</a>
        <pre>{JSON.stringify(exportPreview, null, 2)}</pre>
      </section>
    </>
  );
}
