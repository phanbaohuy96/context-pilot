import { NextResponse } from "next/server";
import { assertSourceCanIngest } from "@context-pilot/core";
import { createTeamsMessageSubscription } from "@context-pilot/graph";
import { prisma } from "@context-pilot/db";
import { getGraphClient, getGraphWebhookUrl } from "../../../../lib/graph";

export async function POST(request: Request): Promise<Response> {
  const { sourceId } = (await request.json()) as { sourceId?: string };

  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  }

  const source = await prisma.monitoredSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  assertSourceCanIngest(source);

  const clientState = process.env.GRAPH_CLIENT_STATE;
  if (!clientState) {
    return NextResponse.json({ error: "GRAPH_CLIENT_STATE is not configured" }, { status: 500 });
  }

  const graph = getGraphClient();
  const subscription = await createTeamsMessageSubscription({
    graph,
    source,
    notificationUrl: getGraphWebhookUrl(),
    clientState,
  });

  await prisma.graphSubscription.upsert({
    where: { graphSubscriptionId: subscription.id },
    update: {
      resource: subscription.resource,
      changeType: subscription.changeType,
      notificationUrl: subscription.notificationUrl,
      clientStateHash: subscription.clientStateHash,
      status: "ACTIVE",
      expiresAt: new Date(subscription.expirationDateTime),
      lastRenewedAt: new Date(),
      lastError: null,
    },
    create: {
      sourceId: source.id,
      graphSubscriptionId: subscription.id,
      resource: subscription.resource,
      changeType: subscription.changeType,
      notificationUrl: subscription.notificationUrl,
      clientStateHash: subscription.clientStateHash,
      status: "ACTIVE",
      expiresAt: new Date(subscription.expirationDateTime),
      lastRenewedAt: new Date(),
    },
  });

  await prisma.monitoredSource.update({
    where: { id: source.id },
    data: { graphResource: subscription.resource },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: source.tenantId,
      action: "graph.subscription.created",
      targetType: "MonitoredSource",
      targetId: source.id,
      metadata: { graphSubscriptionId: subscription.id, resource: subscription.resource },
    },
  });

  return NextResponse.json({ subscriptionId: subscription.id, expiresAt: subscription.expirationDateTime });
}
