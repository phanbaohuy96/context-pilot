// Online speaker clustering for the meeting assistant. Voice embeddings (computed
// from each finalized utterance by the capture layer) are grouped into stable
// "Speaker N" identities within a single meeting. This is deterministic — no model
// call here; the embedding model lives in the capture layer, the grouping is code.

export type SpeakerCluster = {
  key: number; // 1-based, stable for the life of a meeting, in first-seen order
  centroid: number[]; // running mean of the embeddings assigned to this speaker
  count: number;
};

// Default cosine-similarity floor for treating two embeddings as the same speaker.
// 0.86 is the calibration point published for wavlm-base-plus-sv; below it, voices
// are treated as distinct. Higher splits one speaker into several; lower merges
// different speakers — tune via MEETING_DIARIZATION_SIMILARITY_THRESHOLD.
export const DEFAULT_SPEAKER_SIMILARITY_THRESHOLD = 0.86;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Assigns an embedding to the most similar existing speaker when their cosine
// similarity meets the threshold, otherwise starts a new speaker. Updates `clusters`
// in place (the caller owns one array per meeting) and returns the chosen 1-based
// speaker key.
export function assignSpeaker(
  clusters: SpeakerCluster[],
  embedding: number[],
  threshold: number = DEFAULT_SPEAKER_SIMILARITY_THRESHOLD,
): number {
  let bestIndex = -1;
  let bestSimilarity = -Infinity;
  for (let i = 0; i < clusters.length; i++) {
    const similarity = cosineSimilarity(clusters[i].centroid, embedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0 && bestSimilarity >= threshold) {
    const cluster = clusters[bestIndex];
    const n = cluster.count;
    cluster.centroid = cluster.centroid.map((value, i) => (value * n + embedding[i]) / (n + 1));
    cluster.count = n + 1;
    return cluster.key;
  }

  const key = clusters.length + 1;
  clusters.push({ key, centroid: [...embedding], count: 1 });
  return key;
}

export function speakerLabel(key: number): string {
  return `Speaker ${key}`;
}
