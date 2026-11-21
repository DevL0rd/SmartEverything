import { background } from '@smarteverything/logging';

export class IngestQueues {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key);
    const next = previous === undefined ? task() : previous.then(task);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    background(
      tail.then(() => {
        if (this.tails.get(key) === tail) {
          this.tails.delete(key);
        }
      }),
      'local.ingest_queue_failed',
      { key },
    );
    return next;
  }

  async idle(): Promise<void> {
    while (this.tails.size > 0) {
      await Promise.all(this.tails.values());
    }
  }
}
