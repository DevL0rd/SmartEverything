import type { MemoryEmbedder } from '../../src/memory/embedder';

const GROUPS: readonly (readonly string[])[] = [
  ['bus', 'train', 'commute', 'transport'],
  ['tea', 'coffee', 'drink', 'beverage'],
  ['dog', 'rex', 'pet', 'cat'],
];

export class FakeMemoryEmbedder implements MemoryEmbedder {
  readonly model = 'fake-embedding';
  calls = 0;
  failing = false;

  embed(texts: readonly string[]): Promise<Float32Array[]> {
    this.calls += 1;
    if (this.failing) return Promise.reject(new Error('no embeddings'));
    return Promise.resolve(texts.map((text) => vectorOf(text)));
  }
}

export function vectorOf(text: string): Float32Array {
  const lower = text.toLowerCase();
  return Float32Array.from(GROUPS.map((group) => (group.some((w) => lower.includes(w)) ? 1 : 0)));
}
