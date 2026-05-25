"use client";

import { useState } from "react";

export function SubscribeButton({ sourceId }: { sourceId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function subscribe() {
    setState("loading");
    setMessage("");

    const response = await fetch("/api/graph/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setState("error");
      setMessage(body.error ?? "Subscription failed");
      return;
    }

    setState("ok");
    setMessage(`Subscribed until ${body.expiresAt}`);
  }

  return (
    <div className="stack">
      <button type="button" onClick={subscribe} disabled={state === "loading"}>
        {state === "loading" ? "Subscribing..." : "Create Graph subscription"}
      </button>
      {message ? <span className={state === "error" ? "badge danger" : "badge success"}>{message}</span> : null}
    </div>
  );
}
