import { describe, expect, it } from "vitest";
import { buildGraphResourceForSource, resolveMessageIdFromNotification } from "./resources";

describe("Graph resources", () => {
  it("builds a channel message subscription resource", () => {
    expect(
      buildGraphResourceForSource({
        sourceType: "TEAM_CHANNEL",
        teamId: "team-1",
        channelId: "channel-1",
      }),
    ).toBe("teams/team-1/channels/channel-1/messages");
  });

  it("builds a chat message subscription resource", () => {
    expect(
      buildGraphResourceForSource({
        sourceType: "GROUP_CHAT",
        chatId: "chat-1",
      }),
    ).toBe("chats/chat-1/messages");
  });

  it("resolves quoted message ids from notification resources", () => {
    expect(resolveMessageIdFromNotification("teams('t')/channels('c')/messages('m-1')")).toBe("m-1");
  });
});
