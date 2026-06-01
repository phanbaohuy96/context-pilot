// The deterministic assist detector (detectMeetingAssistInsights in ./meetings) prefixes
// each insight's text with a human label, e.g. "Possible question for you: <question>".
// These are the single source of truth for those labels: ./meetings mints with them and
// `assistInsightDisplayText` strips them, so the two can never drift. The assist cards
// show — and translate — the text WITHOUT the label, and the client and server must derive
// the exact same string (their hashes key the translation cache). Dependency-free so it is
// safe to bundle client-side.
export const ASSIST_LABEL_PREFIXES: Record<string, string> = {
  QUESTION_FOR_YOU: "Possible question for you:",
  ANSWER_SUGGESTION: "Reply idea:",
  ACTION_ITEM: "Likely action item:",
  NAME_MENTION: "Your name was mentioned:",
};

export function assistInsightDisplayText(kind: string, text: string): string {
  const prefix = ASSIST_LABEL_PREFIXES[kind];
  const trimmed = text.trimStart();
  if (prefix && trimmed.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
    return trimmed.slice(prefix.length).trim();
  }
  return text.trim();
}
