"use client";

import { FormEvent, useState } from "react";

type AgentResponse = {
  answer: string;
  evidenceMessageIds: string[];
  model: string;
};

type AgentConsoleProps = {
  sourceId?: string;
  title?: string;
  defaultQuestion?: string;
  layout?: "two-column" | "stack";
};

const quickQuestions = [
  "Summarize this chat for mobile app estimation.",
  "Analyze the risks and assumptions in this chat.",
  "Explore the workflows and features implied by this chat.",
  "Find open questions we still need to answer before quoting.",
];

export function AgentConsole({
  sourceId,
  title = "Ask over discovery evidence",
  defaultQuestion = "What mobile app features and estimation risks are visible so far?",
  layout = "two-column",
}: AgentConsoleProps) {
  const [question, setQuestion] = useState(defaultQuestion);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResponse(null);

    const result = await fetch("/api/agent/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, sourceId }),
    });

    const body = await result.json().catch(() => ({}));

    if (!result.ok) {
      setError(body.error ?? "Agent request failed");
      setLoading(false);
      return;
    }

    setResponse(body);
    setLoading(false);
  }

  return (
    <section className={layout === "stack" ? "stack" : "grid grid-2"}>
      <form onSubmit={submit} className="card form-grid">
        <h3>{title}</h3>
        <div className="grid">
          {quickQuestions.map((quickQuestion) => (
            <button
              key={quickQuestion}
              className="secondary"
              type="button"
              onClick={() => setQuestion(quickQuestion)}
            >
              {quickQuestion}
            </button>
          ))}
        </div>
        <label>
          Question
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Asking..." : "Ask agent"}
        </button>
        {error ? <span className="badge danger">{error}</span> : null}
      </form>

      <section className="card stack">
        <h3>Answer</h3>
        {response ? (
          <>
            <p className="message">{response.answer}</p>
            <p className="muted">Model: {response.model}</p>
            <p className="muted">Evidence: {response.evidenceMessageIds.join(", ") || "None"}</p>
          </>
        ) : (
          <p className="muted">Ask a question to explore the gathered Teams context.</p>
        )}
      </section>
    </section>
  );
}
