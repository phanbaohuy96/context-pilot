import { sanitizeTeamsHtml, teamsHtmlToText, type NormalizedTeamsMessage } from "@teams-observer/core";

type GraphIdentity = {
  id?: string;
  displayName?: string;
};

type GraphChatMessage = {
  id?: string;
  replyToId?: string | null;
  subject?: string | null;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  webUrl?: string;
  from?: {
    user?: GraphIdentity | null;
    application?: GraphIdentity | null;
    device?: GraphIdentity | null;
  } | null;
  body?: {
    content?: string | null;
    contentType?: string | null;
  } | null;
};

export function normalizeGraphChatMessage(raw: unknown): NormalizedTeamsMessage {
  const message = raw as GraphChatMessage;

  if (!message.id) {
    throw new Error("Graph chat message is missing an id.");
  }

  const sender = message.from?.user ?? message.from?.application ?? message.from?.device ?? undefined;
  const contentHtml = sanitizeTeamsHtml(message.body?.content);
  const contentText = teamsHtmlToText(contentHtml);
  const createdAt = message.createdDateTime ? new Date(message.createdDateTime) : new Date();

  return {
    externalId: message.id,
    threadId: message.replyToId ?? message.id,
    replyToId: message.replyToId ?? undefined,
    senderName: sender?.displayName,
    senderId: sender?.id,
    subject: message.subject ?? undefined,
    contentHtml,
    contentText,
    webUrl: message.webUrl,
    createdAt,
    rawJson: raw,
  };
}
