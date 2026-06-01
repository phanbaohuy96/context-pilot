import { supersededByFromMetadata } from "@context-pilot/core";

// Transcript rows hidden by correction (superseded fragments) are still stored for
// provenance, so the DB holds more rows than the UI shows. Fetch a wider window, then
// drop superseded rows and cap to the visible window — otherwise retained fragments eat
// into the row budget and the visible transcript truncates earlier than it should.
export const TRANSCRIPT_FETCH_WINDOW = 2000;
export const TRANSCRIPT_VISIBLE_WINDOW = 1000;

// Centralizes the "hide correction-superseded rows" rule so every server consumer applies
// it the same way. Input must be ordered startedAt DESC; returns the most-recent visible
// window, still DESC.
export function visibleTranscriptWindow<T extends { engineMetadata: unknown }>(rowsDesc: T[]): T[] {
  return rowsDesc
    .filter((row) => !supersededByFromMetadata(row.engineMetadata))
    .slice(0, TRANSCRIPT_VISIBLE_WINDOW);
}
