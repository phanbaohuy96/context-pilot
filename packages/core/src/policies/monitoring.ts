import type { SourceStatus, SourceType } from "../domain/sources";

export type IngestibleSource = {
  id: string;
  sourceType: SourceType;
  status: SourceStatus;
  teamId?: string | null;
  channelId?: string | null;
  chatId?: string | null;
};

export function assertSourceCanIngest(source: IngestibleSource): void {
  if (source.status !== "APPROVED") {
    throw new Error(`Source ${source.id} is not approved for ingestion.`);
  }

  if (source.sourceType === "TEAM_CHANNEL" && (!source.teamId || !source.channelId)) {
    throw new Error(`Source ${source.id} is missing team/channel identifiers.`);
  }

  if ((source.sourceType === "GROUP_CHAT" || source.sourceType === "CHAT") && !source.chatId) {
    throw new Error(`Source ${source.id} is missing chat identifier.`);
  }
}

export function isHighSensitivitySource(sourceType: SourceType): boolean {
  return sourceType === "GROUP_CHAT" || sourceType === "CHAT";
}
