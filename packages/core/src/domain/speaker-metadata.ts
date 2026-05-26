type SpeakerMetadata = {
  speakerKey?: unknown;
  speakerLabel?: unknown;
  speakerAlias?: unknown;
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
