import { describe, expect, it } from 'vitest';
import { PhotoVectorIndex } from '../../../src/photos/ai/index';
import {
  VectorShapeError,
  dotInt8,
  float32Bytes,
  float32Of,
  int8Of,
  normalise,
  quantise,
} from '../../../src/photos/ai/vectors';
import type { PhotoEmbedding } from '../../../src/store/repositories/photo-embeddings';

function embedding(itemId: string, vector: number[], model = 'm'): PhotoEmbedding {
  const stored = quantise(Float32Array.from(vector));
  return { itemId, rev: 1, model, dims: vector.length, scale: stored.scale, vector: stored.bytes };
}

describe('vector storage', () => {
  it('round trips floats through little endian bytes', () => {
    const vector = Float32Array.from([0.5, -1.25, 3e-5, 0]);
    expect(float32Of(float32Bytes(vector))).toEqual(vector);
  });

  it('reads a stored vector that starts inside a larger buffer', () => {
    const bytes = float32Bytes(Float32Array.from([1, 2]));
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    expect(float32Of(padded.subarray(3))).toEqual(Float32Array.from([1, 2]));
  });

  it('refuses bytes that are not whole floats', () => {
    expect(() => float32Of(new Uint8Array(5))).toThrow(VectorShapeError);
  });

  it('keeps cosine similarity within one percent after int8 quantisation', () => {
    const a = Float32Array.from({ length: 512 }, (_, index) => Math.sin(index * 0.37));
    const b = Float32Array.from({ length: 512 }, (_, index) => Math.sin(index * 0.37 + 0.4));
    const exact = normalise(a).reduce(
      (sum, value, index) => sum + value * (normalise(b)[index] ?? 0),
      0,
    );
    const stored = quantise(b);
    expect(dotInt8(normalise(a), int8Of(stored.bytes), stored.scale)).toBeCloseTo(exact, 2);
  });

  it('quantises a zero vector without dividing by zero', () => {
    const stored = quantise(new Float32Array(4));
    expect(stored.scale).toBe(1);
    expect([...int8Of(stored.bytes)]).toEqual([0, 0, 0, 0]);
    expect(normalise(new Float32Array(2))).toEqual(new Float32Array(2));
  });

  it('stops a dot product at the shorter vector', () => {
    expect(dotInt8(Float32Array.from([1, 1, 1]), Int8Array.from([2, 2]), 0.5)).toBe(2);
  });
});

describe('the in-memory vector index', () => {
  it('ranks by cosine, keeps only the requested model and drops entries under the cut', async () => {
    const entries = [
      embedding('near', [1, 0.1, 0]),
      embedding('far', [0, 1, 0]),
      embedding('other-model', [1, 0, 0], 'old'),
    ];
    const index = new PhotoVectorIndex({
      after: (after): Promise<PhotoEmbedding[]> => Promise.resolve(after === null ? entries : []),
    });
    const hits = await index.search(Float32Array.from([1, 0, 0]), 'm', 0.5);
    expect(hits.map((hit) => hit.itemId)).toEqual(['near']);
    expect(hits[0]?.score).toBeGreaterThan(0.99);
    expect(index.size()).toBe(3);
  });

  it('loads every page lazily, keeps live updates and forgets removed photos', async () => {
    const pages = [[embedding('a', [1, 0])], [embedding('b', [0, 1])], []];
    let call = 0;
    const index = new PhotoVectorIndex({
      after: (): Promise<PhotoEmbedding[]> => Promise.resolve(pages[call++] ?? []),
    });
    index.upsert(embedding('live', [1, 1]));
    await index.ready();
    await index.ready();
    expect(index.size()).toBe(3);
    index.remove('a');
    expect(
      (await index.search(Float32Array.from([1, 1]), 'm', 0.9)).map((hit) => hit.itemId),
    ).toEqual(['live']);
    index.clear();
    expect(index.size()).toBe(0);
  });

  it('orders equal scores by item id', async () => {
    const entries = [embedding('b', [1, 0]), embedding('a', [1, 0])];
    const index = new PhotoVectorIndex({
      after: (after): Promise<PhotoEmbedding[]> => Promise.resolve(after === null ? entries : []),
    });
    expect(
      (await index.search(Float32Array.from([1, 0]), 'm', 0)).map((hit) => hit.itemId),
    ).toEqual(['a', 'b']);
  });
});
