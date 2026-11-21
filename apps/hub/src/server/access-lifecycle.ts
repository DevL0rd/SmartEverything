import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';

const log = new Logger('hub.access-lifecycle');

const LONGEST_TIMER_MS = 2_147_483_647;

export interface LifecycleOptions {
  readonly store: Pick<Store, 'host'>;
  readonly now: () => Date;
  readonly clientRemoved: (clientId: string) => void;
  readonly clientPaused: (clientId: string) => void;
  readonly lapseGrants: () => Promise<void>;
}

export class AccessLifecycle {
  private timer: NodeJS.Timeout | undefined;
  private work: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(private readonly options: LifecycleOptions) {}

  start(): void {
    this.stopped = false;
    this.queue('sweep', () => this.sweepNow());
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  async idle(): Promise<void> {
    let current: Promise<void>;
    do {
      current = this.work;
      await current;
    } while (current !== this.work);
  }

  arm(): void {
    this.queue('arm', () => this.armNow());
  }

  async revoke(profileId: string, by: string): Promise<number> {
    const { removed, ended } = await this.options.store.host.write('accessRevoke', {
      profileId,
      by,
      now: this.options.now().toISOString(),
    });
    this.withdrawn(removed);
    if (ended) this.arm();
    return removed.length;
  }

  withdrawn(clientIds: readonly string[]): void {
    for (const clientId of clientIds) this.options.clientRemoved(clientId);
  }

  private queue(what: string, task: () => Promise<void>): void {
    this.work = this.work.then(task).catch((cause: unknown) => {
      log.error(`access.${what}_failed`, cause);
    });
  }

  private async sweepNow(): Promise<void> {
    const { store, now, clientPaused } = this.options;
    this.withdrawn(await store.host.write('accessSweepExpired', { now: now().toISOString() }));
    await this.options.lapseGrants();
    const paused = await store.host.read('accessPausedClients', { now: now().toISOString() });
    for (const clientId of paused) clientPaused(clientId);
    await this.armNow();
  }

  private async armNow(): Promise<void> {
    const { store, now } = this.options;
    const next = await store.host.read('accessNextEdge', { now: now().toISOString() });
    clearTimeout(this.timer);
    if (next === null || this.stopped) {
      this.timer = undefined;
      return;
    }
    const wait = Math.min(Math.max(next - now().getTime(), 0), LONGEST_TIMER_MS);
    this.timer = setTimeout(() => {
      this.queue('sweep', () => this.sweepNow());
    }, wait);
    this.timer.unref();
  }
}
