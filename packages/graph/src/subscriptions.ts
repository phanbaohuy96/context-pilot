import { sha256, type SourceType } from "@teams-observer/core";
import { MicrosoftGraphClient, type GraphSubscriptionResponse } from "./client";
import { buildGraphResourceForSource, defaultSubscriptionExpiration } from "./resources";

export type SourceForSubscription = {
  sourceType: SourceType;
  teamId?: string | null;
  channelId?: string | null;
  chatId?: string | null;
};

export async function createTeamsMessageSubscription(input: {
  graph: MicrosoftGraphClient;
  source: SourceForSubscription;
  notificationUrl: string;
  clientState: string;
  expiresAt?: Date;
}): Promise<GraphSubscriptionResponse & { clientStateHash: string }> {
  const resource = buildGraphResourceForSource(input.source);
  const subscription = await input.graph.createSubscription({
    resource,
    notificationUrl: input.notificationUrl,
    clientState: input.clientState,
    expirationDateTime: input.expiresAt ?? defaultSubscriptionExpiration(),
  });

  return {
    ...subscription,
    clientStateHash: sha256(input.clientState),
  };
}

export async function renewTeamsMessageSubscription(input: {
  graph: MicrosoftGraphClient;
  graphSubscriptionId: string;
  expiresAt?: Date;
}): Promise<GraphSubscriptionResponse> {
  return input.graph.renewSubscription(
    input.graphSubscriptionId,
    input.expiresAt ?? defaultSubscriptionExpiration(),
  );
}
