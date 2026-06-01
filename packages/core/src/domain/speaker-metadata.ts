type SpeakerMetadata = {
  speakerKey?: unknown;
  speakerLabel?: unknown;
  speakerAlias?: unknown;
  interim?: unknown;
  merged?: unknown;
  sourceUtteranceIds?: unknown;
  supersededBy?: unknown;
  translation?: unknown;
};

// A cached per-utterance translation stored on engineMetadata. `sourceHash` is the
// hash of the transcript text that was translated, so a later text change (e.g. a
// merge replacing fragments) is detectable and the stale translation is ignored.
export type UtteranceTranslation = {
  lang: string;
  text: string;
  sourceHash: string;
};

export function speakerKeyFromMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const value = (metadata as SpeakerMetadata).speakerKey;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

export function speakerLabelFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const value = (metadata as SpeakerMetadata).speakerLabel;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function speakerAliasFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const value = (metadata as SpeakerMetadata).speakerAlias;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

export function metadataWithSpeakerAlias(metadata: unknown, alias: string): Record<string, unknown> {
  const base = metadataObject(metadata);
  const trimmed = alias.trim();
  if (trimmed) {
    base.speakerAlias = trimmed;
  } else {
    delete base.speakerAlias;
  }
  return base;
}

export function metadataWithDiarizedSpeaker(metadata: unknown, speakerKey: number, speakerLabel: string): Record<string, unknown> {
  const base = metadataObject(metadata);
  const existingKey = speakerKeyFromMetadata(base);
  if (existingKey !== speakerKey) {
    delete base.speakerAlias;
  }
  base.speakerKey = speakerKey;
  base.speakerLabel = speakerLabel.trim();
  return base;
}

// True for an interim (still-refining) utterance row, whose text is not yet final.
export function isInterimMetadata(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && (metadata as SpeakerMetadata).interim === true;
}

// IDs of the original fragment rows a merged utterance was built from (undefined when
// the row is not a merge).
export function mergedSourceIdsFromMetadata(metadata: unknown): string[] | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const value = (metadata as SpeakerMetadata).sourceUtteranceIds;
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0);
  return ids.length ? ids : undefined;
}

// The id of the merged row that replaced this fragment (undefined when not superseded).
export function supersededByFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const value = (metadata as SpeakerMetadata).supersededBy;
  return typeof value === "string" && value ? value : undefined;
}

// Metadata for a new merged row: flags it as merged and records the source fragments.
export function metadataAsMerged(metadata: unknown, sourceUtteranceIds: string[]): Record<string, unknown> {
  const base = metadataObject(metadata);
  base.merged = true;
  base.sourceUtteranceIds = [...sourceUtteranceIds];
  return base;
}

// Mark an original fragment as superseded by a merged row, so the UI hides it while
// the row itself is retained.
export function metadataWithSupersededBy(metadata: unknown, mergedId: string): Record<string, unknown> {
  const base = metadataObject(metadata);
  base.supersededBy = mergedId;
  return base;
}

// Re-exported from a dependency-free module so it stays the single source of truth: the
// client bundle imports it directly from "@context-pilot/core/hash" (the core barrel
// can't be bundled client-side because it pulls in node:crypto).
export { hashTranscriptText } from "./hash";

export function translationFromMetadata(metadata: unknown): UtteranceTranslation | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const value = (metadata as SpeakerMetadata).translation;
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const { lang, text, sourceHash } = value as Record<string, unknown>;
  if (typeof lang === "string" && typeof text === "string" && typeof sourceHash === "string") {
    return { lang, text, sourceHash };
  }
  return undefined;
}

export function metadataWithTranslation(metadata: unknown, translation: UtteranceTranslation): Record<string, unknown> {
  const base = metadataObject(metadata);
  base.translation = { ...translation };
  return base;
}
