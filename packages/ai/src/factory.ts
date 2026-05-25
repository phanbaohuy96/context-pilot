import { ClaudeCodeCliProvider } from "./providers/claude-code-cli";
import { LocalOpenAiProvider } from "./providers/local-openai";
import type { AiProvider, AiProviderKind } from "./provider";

export type AiProviderEnvironment = Partial<Record<string, string | undefined>>;

export function createAiProvider(kind: AiProviderKind, env: AiProviderEnvironment = process.env): AiProvider {
  if (kind === "CLAUDE_CODE_CLI") {
    return new ClaudeCodeCliProvider({
      command: env.CLAUDE_CODE_COMMAND ?? "claude",
      cwd: env.CLAUDE_CODE_WORKDIR,
      timeoutMs: Number(env.CLAUDE_CODE_TIMEOUT_MS ?? 120_000),
    });
  }

  return new LocalOpenAiProvider({
    baseUrl: env.LOCAL_AI_BASE_URL ?? "http://localhost:11434/v1",
    model: env.LOCAL_AI_MODEL ?? "llama3.1",
    apiKey: env.LOCAL_AI_API_KEY,
  });
}
