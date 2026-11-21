import type { PhotoEmbedding } from '../../store/repositories/photo-embeddings';
import { dotInt8, int8Of, normalise } from './vectors';

export interface MeaningHit {
  readonly itemId: string;
  readonly score: number;
}

interface Entry {
  readonly rev: number;
  readonly model: string;
  readonly scale: number;
  readonly values: Int8Array;
}

export interface EmbeddingSource {
  readonly after: (itemId: string | null, size: number) => Promise<readonly PhotoEmbedding[]>;
}

const PAGE = 2000;

const SLICE_MS = 4;

function nextTurn(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

export class PhotoVectorIndex {
  private readonly entries = new Map<string, Entry>();
  private loading: Promise<void> | undefined;

  constructor(private readonly source: EmbeddingSource) {}

  async ready(): Promise<void> {
    this.loading ??= this.load();
    await this.loading;
  }

  upsert(embedding: PhotoEmbedding): void {
    this.entries.set(embedding.itemId, {
      rev: embedding.rev,
      model: embedding.model,
      scale: embedding.scale,
      values: int8Of(embedding.vector),
    });
  }

  remove(itemId: string): void {
    this.entries.delete(itemId);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  async search(query: Float32Array, model: string, minScore: number): Promise<MeaningHit[]> {
    await this.ready();
    const unit = normalise(query);
    const hits: MeaningHit[] = [];
    let started = performance.now();
    for (const [itemId, entry] of [...this.entries]) {
      if (performance.now() - started >= SLICE_MS) {
        await nextTurn();
        started = performance.now();
      }
      if (entry.model !== model) continue;
      const score = dotInt8(unit, entry.values, entry.scale);
      if (score >= minScore) hits.push({ itemId, score });
    }
    return hits.toSorted((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
  }

  private async load(): Promise<void> {
    let after: string | null = null;
    for (;;) {
      const page = await this.source.after(after, PAGE);
      for (const embedding of page) {
        if (!this.entries.has(embedding.itemId)) this.upsert(embedding);
      }
      const last = page.at(-1);
      if (last === undefined) return;
      after = last.itemId;
    }
  }
}
