"use client";

import { useEffect, useState } from "react";

type TeamsChat = {
  id: string;
  displayName: string;
  chatType: string;
  lastUpdatedDateTime?: string | null;
};

type ChatListResponse = {
  connected: boolean;
  chats: TeamsChat[];
  message?: string;
};

type SelectedSource = {
  id: string;
  displayName: string;
};

export function TeamsChatPicker() {
  const [loading, setLoading] = useState(true);
  const [selectingChatId, setSelectingChatId] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatListResponse>({ connected: false, chats: [] });
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);

  useEffect(() => {
    void loadChats();
  }, []);

  async function loadChats() {
    setLoading(true);
    setError("");

    const result = await fetch("/api/graph/chats");
    const body = (await result.json().catch(() => ({ connected: false, chats: [] }))) as ChatListResponse;

    if (!result.ok) {
      setError(body.message ?? "Could not load Teams chats.");
    }

    setResponse(body);
    setLoading(false);
  }

  async function selectChat(chat: TeamsChat) {
    setSelectingChatId(chat.id);
    setError("");
    setSelectedSource(null);

    const sourceType = chat.chatType === "oneOnOne" ? "CHAT" : "GROUP_CHAT";
    const result = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: chat.displayName,
        sourceType,
        chatId: chat.id,
      }),
    });
    const body = await result.json().catch(() => ({}));

    if (!result.ok) {
      setError(body.error ?? "Could not approve selected chat.");
      setSelectingChatId(null);
      return;
    }

    setSelectedSource({ id: body.source.id, displayName: body.source.displayName });
    setSelectingChatId(null);
  }

  return (
    <section className="card stack">
      <div>
        <h3>Connect Teams and choose a chat</h3>
        <p className="muted">
          Connect your Teams identity to list available chats. Selecting a chat explicitly approves it for this workspace.
        </p>
      </div>

      <div className="grid grid-2">
        <a className="button" href="/api/graph/auth/start">Connect Teams</a>
        <button className="secondary" type="button" onClick={loadChats} disabled={loading}>
          {loading ? "Loading chats..." : "Refresh chats"}
        </button>
      </div>

      {!response.connected ? (
        <p className="muted">{response.message ?? "Teams is not connected yet."}</p>
      ) : null}
      {error ? <span className="badge danger">{error}</span> : null}
      {selectedSource ? (
        <p>
          Approved <strong>{selectedSource.displayName}</strong>. <a href={`/chats/${selectedSource.id}`}>Open workspace</a>
        </p>
      ) : null}

      {response.chats.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Chat</th>
              <th>Type</th>
              <th>Last updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {response.chats.map((chat) => (
              <tr key={chat.id}>
                <td>{chat.displayName}</td>
                <td><span className="badge">{chat.chatType}</span></td>
                <td>{chat.lastUpdatedDateTime ?? "Unknown"}</td>
                <td>
                  <button type="button" onClick={() => selectChat(chat)} disabled={selectingChatId === chat.id}>
                    {selectingChatId === chat.id ? "Approving..." : "Use this chat"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
