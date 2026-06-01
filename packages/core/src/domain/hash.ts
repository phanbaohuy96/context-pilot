// djb2 string hash — deterministic and dependency-free, so this module is safe to import
// into a client bundle (unlike the core barrel, which pulls in node:crypto via security).
// Used to key a cached transcript translation against the text it was translated from.
export function hashTranscriptText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}
