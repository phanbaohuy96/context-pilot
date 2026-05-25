import { prisma } from "@teams-observer/db";

export const dynamic = "force-dynamic";

export default async function ThreadsPage() {
  const messages = await prisma.message.findMany({
    include: { source: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const summaries = await prisma.threadSummary.findMany({
    include: { source: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <>
      <header className="page-header">
        <h2>Conversation explorer</h2>
        <p>Review ingested Teams messages and generated summaries with source context.</p>
      </header>

      <section className="grid grid-2">
        <div className="card stack">
          <h3>Recent summaries</h3>
          {summaries.length ? summaries.map((summary) => (
            <article key={summary.id} className="card">
              <h3>{summary.source.displayName} · thread {summary.threadId}</h3>
              <p className="message">{summary.summary}</p>
              <p className="muted">Evidence: {summary.evidenceMessageIds.join(", ")}</p>
            </article>
          )) : <p className="muted">No summaries yet.</p>}
        </div>

        <div className="card stack">
          <h3>Recent messages</h3>
          {messages.length ? messages.map((message) => (
            <article key={message.id} className="card">
              <h3>{message.source.displayName}</h3>
              <p className="muted">
                {message.senderName ?? "Unknown sender"} · {message.createdAt.toISOString()} · thread {message.threadId}
              </p>
              <p className="message">{message.contentText || "Empty message"}</p>
              <p className="muted">Message ID: {message.id}</p>
            </article>
          )) : <p className="muted">No messages ingested yet.</p>}
        </div>
      </section>
    </>
  );
}
