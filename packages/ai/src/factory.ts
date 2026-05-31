import { ClaudeCodeCliProvider } from "./providers/claude-code-cli";
import { CodexCliProvider } from "./providers/codex-cli";
import { LocalOpenAiProvider } from "./providers/local-openai";
import type { AiProvider, AiProviderKind } from "./provider";

export type AiProviderConfig = Partial<Record<string, string | undefined>>;

export function createAiProvider(kind: AiProviderKind, config: AiProviderConfig = {}): AiProvider {
  if (kind === "CLAUDE_CODE_CLI") {
    return new ClaudeCodeCliProvider({
      command: config.CLAUDE_CODE_COMMAND ?? "claude",
      cwd: config.CLAUDE_CODE_WORKDIR,
      timeoutMs: Number(config.CLAUDE_CODE_TIMEOUT_MS ?? 120_000),
    });
  }

  if (kind === "CODEX_CLI") {
    return new CodexCliProvider({
      command: config.CODEX_CLI_COMMAND ?? "codex",
      cwd: config.CODEX_CLI_WORKDIR,
      model: config.CODEX_CLI_MODEL,
      timeoutMs: Number(config.CODEX_CLI_TIMEOUT_MS ?? 120_000),
    });
  }

  return new LocalOpenAiProvider({
    baseUrl: config.LOCAL_AI_BASE_URL ?? "http://localhost:11434/v1",
    model: config.LOCAL_AI_MODEL ?? "llama3.1",
    apiKey: config.LOCAL_AI_API_KEY,
  });
}
