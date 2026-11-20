import { messageOf, type Logger } from '@smarteverything/logging';
import { SLICE_MS, type SliceWriter, type Yield } from '../store/slices';

interface Queued {
  readonly run: () => () => void;
  readonly reject: (cause: unknown) => void;
}

export class WriteBatch {
  private queue: Queued[] = [];
  private scheduled = false;

  constructor(
    private readonly writer: SliceWriter,
    private readonly log: Logger,
    private readonly defer: Yield = setImmediate,
  ) {}

  write = <T>(work: () => T): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: () => {
          const value = work();
          return (): void => {
            resolve(value);
          };
        },
        reject,
      });
      this.schedule();
    });

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.defer(this.flush);
  }

  private readonly flush = (): void => {
    this.scheduled = false;
    const settled: (() => void)[] = [];
    try {
      this.writer.write(() => {
        const started = performance.now();
        for (const entry of this.queue) {
          settled.push(entry.run());
          if (performance.now() - started >= SLICE_MS) return;
        }
      });
      this.queue.splice(0, settled.length);
      for (const settle of settled) settle();
    } catch (cause) {
      const alone = this.queue.splice(0, settled.length + 1);
      this.log.warn('drive.write_batch_split', { writes: alone.length, error: messageOf(cause) });
      this.alone(alone);
    }
    if (this.queue.length > 0) this.schedule();
  };

  private alone(entries: readonly Queued[]): void {
    for (const entry of entries) {
      try {
        this.writer.write(entry.run)();
      } catch (cause) {
        entry.reject(cause);
      }
    }
  }
}
