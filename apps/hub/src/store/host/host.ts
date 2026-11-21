import type { Logger } from '@smarteverything/logging';
import type { DriveFolders } from '../../data-layout/drive-folders';
import type { Repositories } from '../assemble';
import type { ChangeFeed } from '../feed';
import type { ReadUnits, WriteUnits } from './registry';
import { HostThread, type HostSettled } from './thread';
import type { UnitInput, UnitOutput } from './unit';

export interface StoreHostOptions {
  readonly script: string;
  readonly readers: number;
  readonly path: string;
  readonly driveFolders: DriveFolders | null;
  readonly busyTimeoutMs: number;
  readonly log: Logger;
  readonly now: () => Date;
  readonly feed: ChangeFeed;
  readonly committed: () => void;
}

type Callable<T, M extends keyof T> = T[M] extends (...args: infer A) => infer R
  ? { readonly args: A; readonly result: Awaited<R> }
  : never;

export class StoreHostReadersError extends Error {
  override readonly name = 'StoreHostReadersError';

  constructor(readonly readers: number) {
    super(`A store needs at least one reader host, not ${String(readers)}.`);
  }
}

export class StoreHost {
  private readonly writer: HostThread;
  private readonly readers: readonly HostThread[];
  private applying = false;
  private closing: Promise<void> | null = null;

  constructor(private readonly options: StoreHostOptions) {
    if (!Number.isInteger(options.readers) || options.readers < 1)
      throw new StoreHostReadersError(options.readers);
    this.writer = this.thread(false);
    this.readers = Array.from({ length: options.readers }, () => this.thread(true));
  }

  read<N extends keyof ReadUnits>(
    name: N,
    input: UnitInput<ReadUnits[N]>,
  ): Promise<UnitOutput<ReadUnits[N]>>;
  read(name: string, input: unknown): Promise<unknown> {
    return this.nextReader().call({ kind: 'unit', name }, input);
  }

  write<N extends keyof WriteUnits>(
    name: N,
    input: UnitInput<WriteUnits[N]>,
  ): Promise<UnitOutput<WriteUnits[N]>>;
  write(name: string, input: unknown): Promise<unknown> {
    return this.writer.call({ kind: 'unit', name }, input);
  }

  call<R extends keyof Repositories, M extends keyof Repositories[R] & string>(
    repository: R,
    method: M,
    ...args: Callable<Repositories[R], M>['args']
  ): Promise<Callable<Repositories[R], M>['result']>;
  call(repository: string, method: string, ...args: unknown[]): Promise<unknown> {
    return this.writer.call({ kind: 'repository', path: [repository, method] }, args);
  }

  get pending(): number {
    return this.all().reduce((total, thread) => total + thread.pending, 0);
  }

  async warm(): Promise<void> {
    await Promise.all(
      this.all().map((thread) => thread.call({ kind: 'unit', name: 'hostPing' }, null)),
    );
  }

  committedOnMain(): void {
    if (this.applying) return;
    for (const thread of this.all()) thread.committedElsewhere();
  }

  close(): Promise<void> {
    this.closing ??= Promise.all(this.all().map((thread) => thread.close())).then(() => undefined);
    return this.closing;
  }

  private all(): readonly HostThread[] {
    return [this.writer, ...this.readers];
  }

  private nextReader(): HostThread {
    const started = this.readers.filter((reader) => reader.started);
    const idle = started.find((reader) => reader.pending === 0);
    if (idle !== undefined) return idle;
    const fresh = this.readers.find((reader) => !reader.started);
    if (fresh !== undefined) return fresh;
    const least = started.reduce<HostThread | undefined>(
      (best, reader) => (best === undefined || reader.pending < best.pending ? reader : best),
      undefined,
    );
    if (least === undefined) throw new StoreHostReadersError(this.readers.length);
    return least;
  }

  private thread(readOnly: boolean): HostThread {
    return new HostThread({
      script: this.options.script,
      path: this.options.path,
      driveFolders: this.options.driveFolders,
      busyTimeoutMs: this.options.busyTimeoutMs,
      readOnly,
      log: this.options.log,
      now: this.options.now,
      settled: (thread, settled): void => {
        this.settled(thread, settled);
      },
    });
  }

  private settled(from: HostThread, settled: HostSettled): void {
    const { feed } = this.options;
    this.applying = true;
    try {
      for (const event of settled.events) {
        if (event.kind === 'row') feed.emit(event.change);
        else if (event.kind === 'notice') feed.notice(event.notice);
        else if (event.kind === 'speech') feed.speech(event.speech);
        else feed.accessChanged();
      }
      if (!settled.committed) return;
      for (const thread of this.all()) if (thread !== from) thread.committedElsewhere();
      this.options.committed();
    } finally {
      this.applying = false;
    }
  }
}
