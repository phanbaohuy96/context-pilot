import { describe, expect, it } from "vitest";
import {
  decryptSettingSecret,
  encryptSettingSecret,
  resolveAiProviderConfigFromSettings,
  resolveTenantAiProviderConfig,
  type AiProviderSettingsRecord,
} from "./ai-provider-settings";

describe("AI provider settings resolution", () => {
  it("loads tenant DB settings and ignores provider config from env", async () => {
    const settings = settingsRecord({
      summarizationProvider: "CODEX_CLI",
      askAgentProvider: "CLAUDE_CODE_CLI",
      codexCommand: "codex-dev",
      codexWorkdir: "/work/codex",
      codexModel: "gpt-5",
      codexTimeoutMs: 45_000,
      claudeCommand: "claude-dev",
      claudeTimeoutMs: 30_000,
    });
    const db = {
      aiProviderSettings: {
        findUnique: async () => settings,
      },
    };

    const summarization = await resolveTenantAiProviderConfig(db, "tenant-1", "SUMMARIZATION", {
      CODEX_CLI_COMMAND: "codex-env",
      CLAUDE_CODE_COMMAND: "claude-env",
    });
    const askAgent = await resolveTenantAiProviderConfig(db, "tenant-1", "ASK_AGENT", {
      CLAUDE_CODE_COMMAND: "claude-env",
    });

    expect(summarization.providerKind).toBe("CODEX_CLI");
    expect(summarization.providerConfig.CODEX_CLI_COMMAND).toBe("codex-dev");
    expect(summarization.providerConfig.CODEX_CLI_WORKDIR).toBe("/work/codex");
    expect(summarization.providerConfig.CODEX_CLI_MODEL).toBe("gpt-5");
    expect(summarization.providerConfig.CODEX_CLI_TIMEOUT_MS).toBe("45000");
    expect(askAgent.providerKind).toBe("CLAUDE_CODE_CLI");
    expect(askAgent.providerConfig.CLAUDE_CODE_COMMAND).toBe("claude-dev");
    expect(askAgent.providerConfig.CLAUDE_CODE_TIMEOUT_MS).toBe("30000");
  });

  it("falls back to hard-coded defaults when no DB settings row exists", () => {
    const askAgent = resolveAiProviderConfigFromSettings(null, "ASK_AGENT", {
      LOCAL_AI_BASE_URL: "http://env.example/v1",
      LOCAL_AI_MODEL: "env-model",
      CLAUDE_CODE_COMMAND: "claude-env",
      CODEX_CLI_COMMAND: "codex-env",
    });
    const meetingNotes = resolveAiProviderConfigFromSettings(null, "MEETING_NOTES", {});

    expect(askAgent.providerKind).toBe("LOCAL_OPENAI");
    expect(askAgent.providerConfig.LOCAL_AI_BASE_URL).toBe("http://localhost:11434/v1");
    expect(askAgent.providerConfig.LOCAL_AI_MODEL).toBe("llama3.1");
    expect(askAgent.providerConfig.CLAUDE_CODE_COMMAND).toBe("claude");
    expect(askAgent.providerConfig.CODEX_CLI_COMMAND).toBe("codex");
    expect(meetingNotes.providerKind).toBe("LOCAL_OPENAI");
  });

  it("encrypts a stored local API key and decrypts it only for local provider execution", () => {
    const env = { SETTINGS_ENCRYPTION_KEY: "test-secret" };
    const encrypted = encryptSettingSecret("local-api-key", env);
    const settings = settingsRecord({
      summarizationProvider: "LOCAL_OPENAI",
      localApiKeyEncrypted: encrypted,
    });

    expect(decryptSettingSecret(encrypted, env)).toBe("local-api-key");
    expect(resolveAiProviderConfigFromSettings(settings, "SUMMARIZATION", env).providerConfig.LOCAL_AI_API_KEY)
      .toBe("local-api-key");
  });

  it("fails loudly when a stored secret is needed but SETTINGS_ENCRYPTION_KEY is missing", () => {
    const encrypted = encryptSettingSecret("local-api-key", { SETTINGS_ENCRYPTION_KEY: "test-secret" });
    const settings = settingsRecord({
      askAgentProvider: "LOCAL_OPENAI",
      localApiKeyEncrypted: encrypted,
    });

    expect(() => resolveAiProviderConfigFromSettings(settings, "ASK_AGENT", {}))
      .toThrow("SETTINGS_ENCRYPTION_KEY is required");
  });
});

function settingsRecord(overrides: Partial<AiProviderSettingsRecord> = {}): AiProviderSettingsRecord {
  return {
    tenantId: "tenant-1",
    summarizationProvider: "LOCAL_OPENAI",
    askAgentProvider: "LOCAL_OPENAI",
    meetingNotesProvider: "LOCAL_OPENAI",
    meetingCorrectionEnabled: false,
    localBaseUrl: null,
    localModel: null,
    localApiKeyEncrypted: null,
    claudeCommand: null,
    claudeWorkdir: null,
    claudeTimeoutMs: null,
    codexCommand: null,
    codexWorkdir: null,
    codexModel: null,
    codexTimeoutMs: null,
    ...overrides,
  };
}
