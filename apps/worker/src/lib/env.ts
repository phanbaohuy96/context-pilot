import { MicrosoftGraphClient } from "@teams-observer/graph";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function hasGraphConfig(): boolean {
  return Boolean(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

export function getGraphClient(): MicrosoftGraphClient {
  return new MicrosoftGraphClient({
    tenantId: requiredEnv("AZURE_TENANT_ID"),
    clientId: requiredEnv("AZURE_CLIENT_ID"),
    clientSecret: requiredEnv("AZURE_CLIENT_SECRET"),
  });
}

export function getClaudeCodeTimeoutMs(): number {
  return Number(process.env.CLAUDE_CODE_TIMEOUT_MS ?? 120_000);
}
