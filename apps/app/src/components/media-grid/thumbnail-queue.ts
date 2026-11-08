import { background } from '@smarteverything/logging';

export class ThumbnailQueue {
  private readonly wanted = new Map<string, () => Promise<void>>();
  private readonly running = new Set<string>();
  private readonly completed = new Set<string>();
  private limit = 0;

  constructor(private readonly failed: (error: unknown) => void) {}

  resize(limit: number): void {
    this.limit = limit;
    this.drain();
  }

  request(key: string, load: () => Promise<void>): () => void {
    this.wanted.set(key, load);
    this.drain();
    return (): void => {
      this.wanted.delete(key);
      this.completed.delete(key);
    };
  }

  private drain(): void {
    for (const [key, load] of this.wanted) {
      if (this.running.size >= this.limit) break;
      if (this.running.has(key) || this.completed.has(key)) continue;
      this.running.add(key);
      let started = false;
      background(
        Promise.resolve()
          .then(() => {
            if (!this.wanted.has(key) || this.limit === 0) return;
            started = true;
            return load();
          })
          .catch(this.failed)
          .finally(() => {
            this.running.delete(key);
            if (started && this.wanted.has(key)) this.completed.add(key);
            this.drain();
          }),
        'photos.thumbnail_prefetch_failed',
      );
    }
  }
}
