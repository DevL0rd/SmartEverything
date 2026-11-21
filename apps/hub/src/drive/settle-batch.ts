import { Logger, background, messageOf } from '@smarteverything/logging';
import type { StoreHost } from '../store/host/host';
import type { SettledContent, SettleInput } from './units/content';

const log = new Logger('hub.drive');

interface Queued {
  readonly input: SettleInput;
  readonly resolve: (settled: SettledContent) => void;
  readonly reject: (cause: unknown) => void;
}

class SettleBatch {
  private queue: Queued[] = [];
  private scheduled = false;
  private writing = false;

  constructor(private readonly host: StoreHost) {}

  settle(input: SettleInput): Promise<SettledContent> {
    return new Promise<SettledContent>((resolve, reject) => {
      this.queue.push({ input, resolve, reject });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.scheduled || this.writing) return;
    this.scheduled = true;
    setImmediate(this.flush);
  }

  private readonly flush = (): void => {
    this.scheduled = false;
    const batch = this.queue;
    this.queue = [];
    if (batch.length === 0) return;
    this.writing = true;
    background(
      this.write(batch).finally(() => {
        this.writing = false;
        if (this.queue.length > 0) this.schedule();
      }),
      'drive.settle_batch_failed',
    );
  };

  private async write(batch: readonly Queued[]): Promise<void> {
    if (batch.length === 1) {
      await this.alone(batch);
      return;
    }
    let settled: SettledContent[];
    try {
      settled = await this.host.write(
        'driveSettleBatch',
        batch.map((entry) => entry.input),
      );
    } catch (cause) {
      log.warn('drive.settle_batch_split', { writes: batch.length, error: messageOf(cause) });
      await this.alone(batch);
      return;
    }
    for (const [index, entry] of batch.entries()) {
      const value = settled[index];
      if (value === undefined) entry.reject(new SettleBatchError(index));
      else entry.resolve(value);
    }
  }

  private async alone(batch: readonly Queued[]): Promise<void> {
    for (const entry of batch) {
      try {
        entry.resolve(await this.host.write('driveSettleContent', entry.input));
      } catch (cause) {
        entry.reject(cause);
      }
    }
  }
}

export class SettleBatchError extends Error {
  override readonly name = 'SettleBatchError';

  constructor(readonly index: number) {
    super(`The settle batch returned no result for write ${String(index)}.`);
  }
}

const batches = new WeakMap<StoreHost, SettleBatch>();

export function settleContent(host: StoreHost, input: SettleInput): Promise<SettledContent> {
  const known = batches.get(host);
  if (known !== undefined) return known.settle(input);
  const batch = new SettleBatch(host);
  batches.set(host, batch);
  return batch.settle(input);
}
