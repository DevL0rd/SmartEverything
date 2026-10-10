import { setImmediate } from 'node:timers/promises';

interface Waiter<R> {
  readonly resolve: (result: R) => void;
  readonly reject: (cause: unknown) => void;
}

interface Entry<T, R> {
  item: T;
  readonly waiters: Waiter<R>[];
}

export interface WriteQueueOptions<T, R> {
  readonly write: (items: readonly T[]) => Promise<readonly R[]>;
  readonly keyOf: (item: T) => string | null;
  readonly failed: (items: readonly T[], cause: unknown) => void;
}

export class WriteQueue<T, R> {
  private readonly entries = new Map<string | number, Entry<T, R>>();
  private anonymous = 0;
  private draining: Promise<void> | null = null;

  constructor(private readonly options: WriteQueueOptions<T, R>) {}

  push(item: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.add(item, { resolve, reject });
    });
  }

  enqueue(item: T): void {
    this.add(item, null);
  }

  async settled(): Promise<void> {
    while (this.draining !== null) {
      await this.draining;
    }
  }

  private add(item: T, waiter: Waiter<R> | null): void {
    const key = this.options.keyOf(item) ?? this.anonymous++;
    const existing = this.entries.get(key);
    const entry = existing ?? { item, waiters: [] };
    entry.item = item;
    if (waiter !== null) {
      entry.waiters.push(waiter);
    }
    this.entries.set(key, entry);
    this.draining ??= this.drain();
  }

  private async drain(): Promise<void> {
    await setImmediate();
    while (this.entries.size > 0) {
      const batch = [...this.entries.values()];
      this.entries.clear();
      await this.writeBatch(batch);
    }
    this.draining = null;
  }

  private async writeBatch(batch: readonly Entry<T, R>[]): Promise<void> {
    const items = batch.map((entry) => entry.item);
    try {
      const results = await this.options.write(items);
      batch.forEach((entry, index) => {
        const result = results[index];
        entry.waiters.forEach((waiter) => {
          if (result === undefined) {
            waiter.reject(new WriteResultMissingError(index, results.length));
          } else {
            waiter.resolve(result);
          }
        });
      });
    } catch (cause) {
      this.options.failed(items, cause);
      batch.forEach((entry) => {
        entry.waiters.forEach((waiter) => {
          waiter.reject(cause);
        });
      });
    }
  }
}

class WriteResultMissingError extends Error {
  override readonly name = 'WriteResultMissingError';

  constructor(index: number, received: number) {
    super(
      `A batched write returned no result for item ${String(index)}; expected one result per item, received ${String(received)}.`,
    );
  }
}
