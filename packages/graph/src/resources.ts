import type { SourceType } from "@teams-observer/core";

export type GraphSourceIdentifiers = {
  sourceType: SourceType;
  teamId?: string | null;
  channelId?: string | null;
  chatId?: string | null;
};

export function buildGraphResourceForSource(source: GraphSourceIdentifiers): string {
  if (source.sourceType === "TEAM_CHANNEL") {
    if (!source.teamId || !source.channelId) {
      throw new Error("Team channel source requires teamId and channelId.");
    }

    return `teams/${source.teamId}/channels/${source.channelId}/messages`;
  }

  if (!source.chatId) {
    throw new Error("Chat source requires chatId.");
  }

  return `chats/${source.chatId}/messages`;
}

export function resolveMessageIdFromNotification(resource: string, resourceDataId?: string): string | undefined {
  if (resourceDataId) {
    return resourceDataId;
  }

  const quotedMessageMatch = resource.match(/messages\('([^']+)'\)/i);
  if (quotedMessageMatch?.[1]) {
    return quotedMessageMatch[1];
  }

  const pathMessageMatch = resource.match(/messages\/([^/]+)/i);
  return pathMessageMatch?.[1];
}

export function defaultSubscriptionExpiration(now = new Date()): Date {
  return new Date(now.getTime() + 50 * 60 * 1000);
}
