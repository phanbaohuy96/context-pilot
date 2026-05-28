import { prisma } from "@context-pilot/db";

export async function getOrCreateDefaultTenant() {
  const azureTenantId = process.env.AZURE_TENANT_ID || "local-dev-tenant";

  return prisma.tenant.upsert({
    where: { azureTenantId },
    update: {},
    create: {
      azureTenantId,
      displayName: process.env.NEXT_PUBLIC_APP_NAME || "ContextPilot",
    },
  });
}
