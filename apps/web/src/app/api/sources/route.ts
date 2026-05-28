import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { buildGraphResourceForSource } from "@context-pilot/graph";
import { monitoredSourceInputSchema } from "@context-pilot/core";
import { prisma } from "@context-pilot/db";
import { getOrCreateDefaultTenant } from "../../../lib/tenant";

export async function GET(): Promise<Response> {
  const sources = await prisma.monitoredSource.findMany({
    include: { subscriptions: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sources });
}

export async function POST(request: Request): Promise<Response> {
  const input = monitoredSourceInputSchema.parse(await request.json());
  const tenant = await getOrCreateDefaultTenant();
  const graphResource = buildGraphResourceForSource(input);
  const existingSource = await prisma.monitoredSource.findFirst({
    where: {
      tenantId: tenant.id,
      sourceType: input.sourceType,
      teamId: input.teamId ?? null,
      channelId: input.channelId ?? null,
      chatId: input.chatId ?? null,
    },
  });

  const source = existingSource
    ? await prisma.monitoredSource.update({
        where: { id: existingSource.id },
        data: {
          displayName: input.displayName,
          status: "APPROVED",
          graphResource,
          approvedAt: new Date(),
        },
      })
    : await prisma.monitoredSource.create({
        data: {
          tenantId: tenant.id,
          displayName: input.displayName,
          sourceType: input.sourceType,
          status: "APPROVED",
          teamId: input.teamId,
          channelId: input.channelId,
          chatId: input.chatId,
          graphResource,
          approvedAt: new Date(),
        },
      });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "source.approved",
      targetType: "MonitoredSource",
      targetId: source.id,
      metadata: { sourceType: source.sourceType, graphResource, reused: Boolean(existingSource) },
    },
  });

  revalidatePath("/sources");
  revalidatePath(`/chats/${source.id}`);

  return NextResponse.json({ source }, { status: existingSource ? 200 : 201 });
}
