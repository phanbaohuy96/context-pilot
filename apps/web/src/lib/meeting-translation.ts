import type { Prisma } from "@prisma/client";
import { createAiProvider } from "@context-pilot/ai";
import { hashTranscriptText, metadataWithTranslation, translationFromMetadata } from "@context-pilot/core";
import { prisma, resolveTenantAiProviderConfig } from "@context-pilot/db";

export const TRANSLATE_TARGET_LANGUAGE = "Vietnamese";
export const TRANSLATE_TARGET_LANG_CODE = "vi";

// Vietnamese is written in the Latin alphabet with diacritics. CJK ideographs / Japanese
// kana / Korean Hangul mean the model code-switched (Chinese-centric models like qwen do this
// intermittently even when told not to), so the output is not a usable Vietnamese translation.
const NON_VIETNAMESE_SCRIPT = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

export function looksLikeVietnamese(text: string): boolean {
  return !NON_VIETNAMESE_SCRIPT.test(text);
}

// Translation is non-deterministic; an unreliable model may only occasionally drift, so
// retry a few times before giving up rather than caching a wrong-language result.
const MAX_TRANSLATE_ATTEMPTS = 3;

export type TranslateResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

// Shared on-demand translate-and-cache, used by both the transcript-utterance and the
// assist-insight translate routes so their caching/error contract can't drift. Translates
// `source` to Vietnamese (skipping the provider when a fresh cached translation already
// exists), then layers the result onto the record's engineMetadata via `writeFresh`, which
// re-reads inside a transaction so a concurrent write (e.g. a correction merge setting
// supersededBy) isn't clobbered. `resolveTenantId` is only called on a cache miss, so a
// cached translation costs no extra query.
export async function translateToVietnamese(opts: {
  source: string;
  cachedMetadata: Prisma.JsonValue;
  resolveTenantId: () => Promise<string | null>;
  writeFresh: (apply: (fresh: Prisma.JsonValue) => Prisma.InputJsonValue) => Promise<void>;
  // Surrounding transcript lines (reference only) to give the model context the isolated
  // line lacks. Resolved lazily so a cache hit doesn't pay for the lookup.
  resolveContext?: () => Promise<string[]>;
}): Promise<TranslateResult> {
  const sourceHash = hashTranscriptText(opts.source);
  const cached = translationFromMetadata(opts.cachedMetadata);
  if (cached && cached.lang === TRANSLATE_TARGET_LANG_CODE && cached.sourceHash === sourceHash) {
    return { ok: true, text: cached.text };
  }

  const tenantId = await opts.resolveTenantId();
  if (!tenantId) {
    return { ok: false, status: 404, error: "Meeting session was not found." };
  }

  const resolved = await resolveTenantAiProviderConfig(prisma, tenantId, "MEETING_NOTES");
  const provider = createAiProvider(resolved.providerKind, resolved.providerConfig);
  const context = opts.resolveContext ? await opts.resolveContext() : undefined;

  let text = "";
  let lastCandidate = "";
  for (let attempt = 1; attempt <= MAX_TRANSLATE_ATTEMPTS; attempt += 1) {
    const result = await provider.translateText({
      text: opts.source,
      targetLanguage: TRANSLATE_TARGET_LANGUAGE,
      context: context?.length ? context : undefined,
    });
    const candidate = result.text.trim();
    if (candidate) {
      lastCandidate = candidate;
    }
    if (candidate && looksLikeVietnamese(candidate)) {
      text = candidate;
      break;
    }
  }
  if (!text) {
    // Fail loud rather than cache garbage: distinguish an empty reply from a wrong-language one.
    return lastCandidate
      ? {
          ok: false,
          status: 502,
          error: "Translation came back in the wrong language; pick a Vietnamese-capable model in Settings.",
        }
      : { ok: false, status: 502, error: "Translation was empty." };
  }

  await opts.writeFresh((fresh) =>
    metadataWithTranslation(fresh, {
      lang: TRANSLATE_TARGET_LANG_CODE,
      text,
      sourceHash,
    }) as Prisma.InputJsonValue,
  );
  return { ok: true, text };
}
