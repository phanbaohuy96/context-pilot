import { describe, expect, it } from "vitest";
import { normalizeGraphChatMessage } from "./normalize";

describe("Graph message normalization", () => {
  it("normalizes Teams chat message payloads", () => {
    const message = normalizeGraphChatMessage({
      id: "message-1",
      createdDateTime: "2026-05-19T12:00:00Z",
      from: { user: { id: "user-1", displayName: "Aisha" } },
      body: { content: "<p>Need offline login for technicians.</p>" },
    });

    expect(message.externalId).toBe("message-1");
    expect(message.threadId).toBe("message-1");
    expect(message.senderName).toBe("Aisha");
    expect(message.contentText).toBe("Need offline login for technicians.");
  });
});
