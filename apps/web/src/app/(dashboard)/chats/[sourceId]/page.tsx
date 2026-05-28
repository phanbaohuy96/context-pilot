import { notFound } from "next/navigation";
import { isHighSensitivitySource } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import { AgentConsole } from "../../../../components/AgentConsole";
import { SubscribeButton } from "../../../../components/SubscribeButton";

export const dynamic = "force-dynamic";

type ChatWorkspacePageProps = {
  params: Promise<{ sourceId: string }>;
};

export default async function ChatWorkspacePage({ params }: ChatWorkspacePageProps) {
  const { sourceId } = await params;
  const source = await prisma.monitoredSource.findUnique({
    where: { id: sourceId },
    include: {
      subscriptions: { orderBy: { expiresAt: "desc" }, take: 1 },
      messages: { orderBy: { createdAt: "asc" }, take: 100 },
      summaries: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!source) {
    notFound();
  }

  const latestSubscription = source.subscriptions[0];

  return (
    <>
      <header className="page-header">
        <h2>{source.displayName}</h2>
        <p>Review this selected Teams chat and ask the agent for summary, analysis, and exploration support.</p>
      </header>

      <section className="grid grid-2">
        <section className="stack">
          <section className="card stack">
            <div>
              <h3>Chat source</h3>
              <p className="muted">This workspace is scoped to one explicitly approved Teams source.</p>
            </div>
            <div className="grid grid-2">
              <p>
                <strong>Type</strong><br />
                <span className={isHighSensitivitySource(source.sourceType) ? "badge danger" : "badge"}>
                  {source.sourceType}
                </span>
              </p>
              <p>
                <strong>Status</strong><br />
                {source.status}
              </p>
              <p>
                <strong>Graph resource</strong><br />
                <code>{source.graphResource ?? "Not created"}</code>
              </p>
              <p>
                <strong>Subscription</strong><br />
                {latestSubscription ? `${latestSubscription.status} until ${latestSubscription.expiresAt.toISOString()}` : "None"}
              </p>
            </div>
            <div className="grid grid-2">
              <a className="button" href="/sources">Back to sources</a>
              <SubscribeButton sourceId={source.id} />
            </div>
          </section>

          <section className="card stack">
            <h3>Chat messages</h3>
            {source.messages.length ? source.messages.map((message) => (
              <article key={message.id} className="card">
                <h3>{message.senderName ?? "Unknown sender"}</h3>
                <p className="muted">
                  {message.createdAt.toISOString()} · thread {message.threadId}
                </p>
                <p className="message">{message.contentText || "Empty message"}</p>
                <p className="muted">Message ID: {message.id}</p>
              </article>
            )) : (
              <p className="muted">No messages have been ingested for this chat yet. Create a subscription or wait for new Graph notifications.</p>
            )}
          </section>

          <section className="card stack">
            <h3>Recent summaries</h3>
            {source.summaries.length ? source.summaries.map((summary) => (
              <article key={summary.id} className="card">
                <h3>Thread {summary.threadId}</h3>
                <p className="message">{summary.summary}</p>
                <p className="muted">Evidence: {summary.evidenceMessageIds.join(", ") || "None"}</p>
                <p className="muted">Model: {summary.model}</p>
              </article>
            )) : (
              <p className="muted">No summaries have been generated for this chat yet.</p>
            )}
          </section>
        </section>

        <AgentConsole
          sourceId={source.id}
          title="Agent support for this chat"
          defaultQuestion="Summarize this chat for mobile app estimation."
          layout="stack"
        />
      </section>
    </>
  );
}
