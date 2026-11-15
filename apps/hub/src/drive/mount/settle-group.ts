import { messageOf, type Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';

interface Item {
  readonly work: () => () => void;
  readonly fail: (cause: unknown) => void;
}

export class SettleGroup {
  private pending: Item[] | null = null;

  constructor(
    private readonly store: Pick<Store, 'write'>,
    private readonly log: Logger,
  ) {}

  readonly run = <T>(work: () => T): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (this.pending === null) {
        this.pending = [];
        setImmediate(() => {
          this.flush();
        });
      }
      this.pending.push({
        work: (): (() => void) => {
          const value = work();
          return (): void => {
            resolve(value);
          };
        },
        fail: reject,
      });
    });

  private flush(): void {
    const items = this.pending ?? [];
    this.pending = null;
    if (items.length === 1) {
      this.alone(items);
      return;
    }
    try {
      const done = this.store.write(() => items.map((item) => item.work()));
      for (const resolve of done) resolve();
    } catch (cause) {
      this.log.warn('drive_mount.settle_group_split', {
        items: items.length,
        reason: messageOf(cause),
      });
      this.alone(items);
    }
  }

  private alone(items: readonly Item[]): void {
    for (const item of items) {
      try {
        this.store.write(item.work)();
      } catch (cause) {
        item.fail(cause);
      }
    }
  }
}
