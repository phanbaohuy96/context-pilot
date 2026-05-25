import { MicrosoftGraphClient } from "@teams-observer/graph";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getGraphClient(): MicrosoftGraphClient {
  return new MicrosoftGraphClient({
    tenantId: requiredEnv("AZURE_TENANT_ID"),
    clientId: requiredEnv("AZURE_CLIENT_ID"),
    clientSecret: requiredEnv("AZURE_CLIENT_SECRET"),
  });
}

export function getGraphWebhookUrl(): string {
  return process.env.GRAPH_WEBHOOK_URL || `${requiredEnv("APP_BASE_URL")}/api/graph/webhook`;
}
