import { prisma } from "@context-pilot/db";
import { defaultSubscriptionExpiration, renewTeamsMessageSubscription } from "@context-pilot/graph";
import { getGraphClient, hasGraphConfig } from "../lib/env";

export async function renewGraphSubscriptions(): Promise<void> {
  if (!hasGraphConfig()) {
    return;
  }

  const graph = getGraphClient();
  const renewBefore = new Date(Date.now() + 10 * 60 * 1000);
  const subscriptions = await prisma.graphSubscription.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: renewBefore },
    },
  });

  for (const subscription of subscriptions) {
    try {
      const renewed = await renewTeamsMessageSubscription({
        graph,
        graphSubscriptionId: subscription.graphSubscriptionId,
        expiresAt: defaultSubscriptionExpiration(),
      });

      await prisma.graphSubscription.update({
        where: { id: subscription.id },
        data: {
          expiresAt: new Date(renewed.expirationDateTime),
          lastRenewedAt: new Date(),
          status: "ACTIVE",
          lastError: null,
        },
      });
    } catch (error) {
      await prisma.graphSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "ERROR",
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
