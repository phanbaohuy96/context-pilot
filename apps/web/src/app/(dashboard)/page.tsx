import { prisma } from "@context-pilot/db";
import { StatCard } from "../../components/StatCard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [sources, activeSubscriptions, messages, requirements, summaries, meetings] = await Promise.all([
    prisma.monitoredSource.count(),
    prisma.graphSubscription.count({ where: { status: "ACTIVE" } }),
    prisma.message.count(),
    prisma.requirement.count(),
    prisma.threadSummary.count(),
    prisma.meetingSession.count(),
  ]);

  return (
    <>
      <header className="page-header">
        <h2>Discovery dashboard</h2>
        <p>Monitor approved Teams sources and run provider-agnostic meeting sessions from local transcripts.</p>
      </header>

      <section className="grid grid-3">
        <StatCard label="Approved sources" value={sources} description="Teams channels or chats explicitly configured here." />
        <StatCard label="Active subscriptions" value={activeSubscriptions} description="Microsoft Graph change notifications currently registered." />
        <StatCard label="Messages" value={messages} description="Normalized Teams messages stored for analysis." />
        <StatCard label="Meeting sessions" value={meetings} description="Provider-agnostic sessions with local transcript evidence." />
        <StatCard label="Summaries" value={summaries} description="AI-generated thread summaries with evidence." />
        <StatCard label="Requirement cards" value={requirements} description="Extracted quoting assumptions, risks, and features." />
        <StatCard label="Mode" value="MVP" description="Local-first AI with optional Claude Code CLI provider." />
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Compliance posture</h3>
        <p className="muted">
          This tool is designed for authorized discovery only. It requires explicit source approval before monitoring and keeps audit records for subscriptions, agent runs, and exports.
        </p>
      </section>
    </>
  );
}
