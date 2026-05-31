export const aiProviderKinds = ["LOCAL_OPENAI", "CLAUDE_CODE_CLI", "CODEX_CLI"] as const;

export type AiProviderKind = (typeof aiProviderKinds)[number];

export type AiProviderFeature = "SUMMARIZATION" | "ASK_AGENT" | "MEETING_NOTES";

export function isAiProviderKind(value: string | undefined): value is AiProviderKind {
  return aiProviderKinds.includes(value as AiProviderKind);
}
