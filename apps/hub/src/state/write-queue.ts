import { clearTimeout, setTimeout as schedule } from 'node:timers';
import { setImmediate, setTimeout } from 'node:timers/promises';

interface Waiter<R> {
  readonly resolve: (result: R) => void;
  readonly reject: (cause: unknown) => void;
}

interface Entry<T, R> {
  item: T;
  readonly waiters: Waiter<R>[];
}

interface AppendPolicy {
  readonly pendingLimit: number;
  readonly batchLimit: number;
  readonly attempts: number;
  readonly retryMs: number;
}

export interface WriteQueueOptions<T, R> {
  readonly write: (items: readonly T[]) => Promise<readonly R[]>;
  readonly keyOf: (item: T) => string | null;
  readonly failed: (items: readonly T[], cause: unknown) => void;
  readonly append?: AppendPolicy;
}

const APPEND_RECOVERY_FIRST_MS = 1000;
const APPEND_RECOVERY_MAX_MS = 30_000;

export class WriteQueue<T, R> {
  private readonly entries = new Map<string | number, Entry<T, R>>();
  private anonymous = 0;
  private draining: Promise<void> | null = null;
  private failure: { readonly cause: unknown } | null = null;
  private recovery: ReturnType<typeof schedule> | null = null;
  private recoveryDelayMs = APPEND_RECOVERY_FIRST_MS;
  private flushes = 0;
  private closed = false;
  private closing: Promise<void> | null = null;

  constructor(private readonly options: WriteQueueOptions<T, R>) {}

  push(item: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.add(item, { resolve, reject });
    });
  }

  enqueue(item: T): void {
    this.add(item, null);
  }

  settled(): Promise<void> {
    return this.closing ?? this.flush();
  }

  close(): Promise<void> {
    this.closed = true;
    this.cancelRecovery();
    this.closing ??= this.flush();
    return this.closing;
  }

  private async flush(): Promise<void> {
    this.cancelRecovery();
    this.flushes += 1;
    try {
      if (this.failure !== null && this.draining === null) {
        this.draining = this.drain();
      }
      while (this.draining !== null) {
        await this.draining;
      }
      this.throwIfFailed();
    } finally {
      this.flushes -= 1;
      if (this.failure !== null) {
        this.scheduleRecovery();
      }
    }
  }

  private cancelRecovery(): void {
    if (this.recovery !== null) {
      clearTimeout(this.recovery);
      this.recovery = null;
    }
  }

  private scheduleRecovery(): void {
    if (this.closed || this.flushes > 0 || this.recovery !== null) {
      return;
    }
    this.recovery = schedule(() => {
      this.recovery = null;
      this.draining ??= this.drain();
    }, this.recoveryDelayMs);
    this.recovery.unref();
    this.recoveryDelayMs = Math.min(this.recoveryDelayMs * 2, APPEND_RECOVERY_MAX_MS);
  }

  private throwIfFailed(): void {
    if (this.failure !== null) {
      throw this.failure.cause;
    }
  }

  private add(item: T, waiter: Waiter<R> | null): void {
    const policy = this.options.append;
    if (this.closed) {
      throw new WriteQueueClosedError();
    }
    if (this.failure !== null) {
      throw new WriteQueueUnavailableError(this.failure.cause);
    }
    if (policy !== undefined && this.entries.size >= policy.pendingLimit) {
      throw new WriteQueuePressureError(policy.pendingLimit);
    }
    const key =
      policy === undefined ? (this.options.keyOf(item) ?? this.anonymous++) : this.anonymous++;
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
      const policy = this.options.append;
      if (policy === undefined) {
        const batch = [...this.entries.values()];
        this.entries.clear();
        await this.writeBatch(batch);
      } else if (!(await this.writeAppend(policy))) {
        break;
      }
    }
    this.draining = null;
  }

  private async writeAppend(policy: AppendPolicy): Promise<boolean> {
    const batch = [...this.entries].slice(0, policy.batchLimit);
    const items = batch.map(([, entry]) => entry.item);
    for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
      try {
        const results = await this.options.write(items);
        this.failure = null;
        this.recoveryDelayMs = APPEND_RECOVERY_FIRST_MS;
        batch.forEach(([key, entry], index) => {
          this.entries.delete(key);
          this.resolve(entry, results, index);
        });
        return true;
      } catch (cause) {
        if (attempt === policy.attempts) {
          this.failure = { cause };
          this.options.failed(items, cause);
          this.scheduleRecovery();
          return false;
        }
        await setTimeout(policy.retryMs);
      }
    }
    return false;
  }

  private resolve(entry: Entry<T, R>, results: readonly R[], index: number): void {
    const result = results[index];
    entry.waiters.forEach((waiter) => {
      if (result === undefined) {
        waiter.reject(new WriteResultMissingError(index, results.length));
      } else {
        waiter.resolve(result);
      }
    });
  }

  private async writeBatch(batch: readonly Entry<T, R>[]): Promise<void> {
    const items = batch.map((entry) => entry.item);
    try {
      const results = await this.options.write(items);
      batch.forEach((entry, index) => {
        this.resolve(entry, results, index);
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

class WriteQueuePressureError extends Error {
  override readonly name = 'WriteQueuePressureError';

  constructor(readonly limit: number) {
    super(`The state write queue already holds its limit of ${String(limit)} pending transitions.`);
  }
}

class WriteQueueUnavailableError extends Error {
  override readonly name = 'WriteQueueUnavailableError';

  constructor(cause: unknown) {
    super('The state write queue must finish its failed transitions before accepting more.', {
      cause,
    });
  }
}

class WriteQueueClosedError extends Error {
  override readonly name = 'WriteQueueClosedError';

  constructor() {
    super('The state write queue is closed and cannot accept more transitions.');
  }
}
