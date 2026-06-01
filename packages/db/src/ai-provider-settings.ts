import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AiProviderFeature, AiProviderKind } from "@context-pilot/core";

export type AiProviderRuntimeConfig = Partial<Record<string, string | undefined>>;

export type AiProviderSettingsRecord = {
  tenantId: string;
  summarizationProvider: AiProviderKind;
  askAgentProvider: AiProviderKind;
  meetingNotesProvider: AiProviderKind;
  meetingNotesEnabled: boolean;
  diarizationEnabled: boolean;
  meetingCorrectionEnabled: boolean;
  localBaseUrl: string | null;
  localModel: string | null;
  localApiKeyEncrypted: string | null;
  claudeCommand: string | null;
  claudeWorkdir: string | null;
  claudeTimeoutMs: number | null;
  codexCommand: string | null;
  codexWorkdir: string | null;
  codexModel: string | null;
  codexTimeoutMs: number | null;
};

export type ResolvedAiProviderConfig = {
  providerKind: AiProviderKind;
  providerConfig: AiProviderRuntimeConfig;
};

export type AiProviderSettingsView = {
  summarizationProvider: AiProviderKind;
  askAgentProvider: AiProviderKind;
  meetingNotesProvider: AiProviderKind;
  localBaseUrl: string;
  localModel: string;
  hasLocalApiKey: boolean;
  claudeCommand: string;
  claudeWorkdir: string;
  claudeTimeoutMs: number;
  codexCommand: string;
  codexWorkdir: string;
  codexModel: string;
  codexTimeoutMs: number;
  meetingNotesEnabled: boolean;
  diarizationEnabled: boolean;
  meetingCorrectionEnabled: boolean;
};

type SettingsDelegate = {
  findUnique(args: { where: { tenantId: string } }): Promise<AiProviderSettingsRecord | null>;
};

export type AiProviderSettingsPrisma = {
  aiProviderSettings: SettingsDelegate;
};

const encryptionPrefix = "v1";
const defaultProviderKind: AiProviderKind = "LOCAL_OPENAI";
const defaultLocalBaseUrl = "http://localhost:11434/v1";
const defaultLocalModel = "llama3.1";
const defaultClaudeCommand = "claude";
const defaultCodexCommand = "codex";
const defaultProviderTimeoutMs = 120_000;

export async function resolveTenantAiProviderConfig(
  db: AiProviderSettingsPrisma,
  tenantId: string,
  feature: AiProviderFeature,
  env: AiProviderRuntimeConfig = process.env,
): Promise<ResolvedAiProviderConfig> {
  const settings = await db.aiProviderSettings.findUnique({ where: { tenantId } });
  return resolveAiProviderConfigFromSettings(settings, feature, env);
}

export function resolveAiProviderConfigFromSettings(
  settings: AiProviderSettingsRecord | null,
  feature: AiProviderFeature,
  env: AiProviderRuntimeConfig = process.env,
): ResolvedAiProviderConfig {
  const providerKind = providerForFeature(settings, feature);
  const providerConfig: AiProviderRuntimeConfig = {
    LOCAL_AI_BASE_URL: settings?.localBaseUrl ?? defaultLocalBaseUrl,
    LOCAL_AI_MODEL: settings?.localModel ?? defaultLocalModel,
    CLAUDE_CODE_COMMAND: settings?.claudeCommand ?? defaultClaudeCommand,
    CLAUDE_CODE_TIMEOUT_MS: String(settings?.claudeTimeoutMs ?? defaultProviderTimeoutMs),
    CODEX_CLI_COMMAND: settings?.codexCommand ?? defaultCodexCommand,
    CODEX_CLI_TIMEOUT_MS: String(settings?.codexTimeoutMs ?? defaultProviderTimeoutMs),
  };

  if (settings?.localApiKeyEncrypted && providerKind === "LOCAL_OPENAI") {
    providerConfig.LOCAL_AI_API_KEY = decryptSettingSecret(settings.localApiKeyEncrypted, env);
  }

  if (settings?.claudeWorkdir) {
    providerConfig.CLAUDE_CODE_WORKDIR = settings.claudeWorkdir;
  }

  if (settings?.codexWorkdir) {
    providerConfig.CODEX_CLI_WORKDIR = settings.codexWorkdir;
  }
  if (settings?.codexModel) {
    providerConfig.CODEX_CLI_MODEL = settings.codexModel;
  }

  return { providerKind, providerConfig };
}

export function getAiProviderSettingsView(
  settings: AiProviderSettingsRecord | null,
  env: AiProviderRuntimeConfig = process.env,
): AiProviderSettingsView {
  return {
    summarizationProvider: settings?.summarizationProvider ?? defaultProviderKind,
    askAgentProvider: settings?.askAgentProvider ?? defaultProviderKind,
    meetingNotesProvider: settings?.meetingNotesProvider ?? defaultProviderKind,
    localBaseUrl: settings?.localBaseUrl ?? defaultLocalBaseUrl,
    localModel: settings?.localModel ?? defaultLocalModel,
    hasLocalApiKey: Boolean(settings?.localApiKeyEncrypted),
    claudeCommand: settings?.claudeCommand ?? defaultClaudeCommand,
    claudeWorkdir: settings?.claudeWorkdir ?? "",
    claudeTimeoutMs: settings?.claudeTimeoutMs ?? defaultProviderTimeoutMs,
    codexCommand: settings?.codexCommand ?? defaultCodexCommand,
    codexWorkdir: settings?.codexWorkdir ?? "",
    codexModel: settings?.codexModel ?? "",
    codexTimeoutMs: settings?.codexTimeoutMs ?? defaultProviderTimeoutMs,
    meetingNotesEnabled: settings?.meetingNotesEnabled ?? false,
    diarizationEnabled: settings?.diarizationEnabled ?? false,
    meetingCorrectionEnabled: settings?.meetingCorrectionEnabled ?? false,
  };
}

export function encryptSettingSecret(secret: string, env: AiProviderRuntimeConfig = process.env): string {
  const key = settingsEncryptionKey(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    encryptionPrefix,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSettingSecret(encrypted: string, env: AiProviderRuntimeConfig = process.env): string {
  const key = settingsEncryptionKey(env);
  const [version, iv, tag, ciphertext] = encrypted.split(":");
  if (version !== encryptionPrefix || !iv || !tag || !ciphertext) {
    throw new Error("Stored settings secret is not in a supported encrypted format.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function providerForFeature(
  settings: AiProviderSettingsRecord | null,
  feature: AiProviderFeature,
): AiProviderKind {
  if (!settings) {
    return defaultProviderKind;
  }
  if (feature === "ASK_AGENT") {
    return settings.askAgentProvider;
  }
  if (feature === "MEETING_NOTES") {
    return settings.meetingNotesProvider;
  }
  return settings.summarizationProvider;
}

function settingsEncryptionKey(env: AiProviderRuntimeConfig): Buffer {
  const raw = env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SETTINGS_ENCRYPTION_KEY is required to save or use stored AI provider secrets.");
  }
  return createHash("sha256").update(raw).digest();
}
