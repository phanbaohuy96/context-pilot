import { describe, expect, it } from "vitest";
import { assignSpeaker, cosineSimilarity, speakerLabel, type SpeakerCluster } from "./diarization";

describe("speaker clustering", () => {
  it("computes cosine similarity and guards degenerate vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0); // zero vector -> 0, not NaN
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0); // length mismatch -> 0
  });

  it("starts a new speaker when no cluster is similar enough", () => {
    const clusters: SpeakerCluster[] = [];
    expect(assignSpeaker(clusters, [1, 0, 0], 0.9)).toBe(1);
    // Orthogonal embedding is below threshold -> a second speaker.
    expect(assignSpeaker(clusters, [0, 1, 0], 0.9)).toBe(2);
    expect(clusters).toHaveLength(2);
  });

  it("reuses a speaker key for a similar voice and updates the centroid toward the mean", () => {
    const clusters: SpeakerCluster[] = [];
    expect(assignSpeaker(clusters, [1, 0, 0], 0.9)).toBe(1);
    // Nearly identical embedding (cosine ~1) -> same speaker.
    expect(assignSpeaker(clusters, [0.98, 0.02, 0], 0.9)).toBe(1);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
    // Centroid moved toward the running mean of the two members.
    expect(clusters[0].centroid[0]).toBeCloseTo(0.99);
    expect(clusters[0].centroid[1]).toBeCloseTo(0.01);
  });

  it("assigns to the most similar existing speaker, not merely the first", () => {
    const clusters: SpeakerCluster[] = [];
    assignSpeaker(clusters, [1, 0, 0], 0.9); // Speaker 1
    assignSpeaker(clusters, [0, 1, 0], 0.9); // Speaker 2
    // Closer to Speaker 2 -> rejoins 2, not 1.
    expect(assignSpeaker(clusters, [0.05, 0.99, 0], 0.9)).toBe(2);
    expect(clusters).toHaveLength(2);
  });

  it("treats the threshold as inclusive (>=) when deciding same vs new speaker", () => {
    // Pin the boundary: a similarity exactly at the threshold joins; just below splits.
    const base = [1, 0];
    const atThreshold = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)]; // cos sim = 0.7071
    const justBelow = [Math.cos(Math.PI / 4 + 0.01), Math.sin(Math.PI / 4 + 0.01)];

    const join: SpeakerCluster[] = [];
    assignSpeaker(join, base, 0.7071);
    expect(assignSpeaker(join, atThreshold, 0.7071)).toBe(1); // at threshold -> same

    const split: SpeakerCluster[] = [];
    assignSpeaker(split, base, 0.7071);
    expect(assignSpeaker(split, justBelow, 0.7071)).toBe(2); // below -> new
  });

  it("labels keys for display", () => {
    expect(speakerLabel(1)).toBe("Speaker 1");
    expect(speakerLabel(3)).toBe("Speaker 3");
  });
});
