import { background } from '@smarteverything/logging';
import type { StoreHost } from '../store/host/host';
import type { WatchKey, WatchState, WatchTrigger } from '../store/repositories/signal-watch-state';
import type { WatchStateStore } from '../signals/signal-watchers';

export class WatchStateNotLoadedError extends Error {
  override readonly name = 'WatchStateNotLoadedError';

  constructor() {
    super('The signal watch state was read before it was loaded from the store host.');
  }
}

function keyOf(key: WatchKey): string {
  return `${key.automationId}\u0000${key.triggerId}\u0000${key.partition}`;
}

function triggerOf(key: Pick<WatchKey, 'automationId' | 'triggerId'>): string {
  return `${key.automationId}\u0000${key.triggerId}`;
}

export class HostWatchState implements WatchStateStore {
  private readonly states = new Map<string, { key: WatchKey; state: WatchState }>();
  private loading: Promise<void> | null = null;
  private ready = false;

  constructor(private readonly host: StoreHost) {}

  prepare(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  readonly load = (key: WatchKey): WatchState | null => {
    this.assertReady();
    return this.states.get(keyOf(key))?.state ?? null;
  };

  readonly save = (key: WatchKey, state: WatchState): void => {
    this.assertReady();
    this.states.set(keyOf(key), { key, state });
    background(
      this.host.call('signalWatchState', 'save', key, state),
      'automation.watch_state_write_failed',
      { automationId: key.automationId, triggerId: key.triggerId },
    );
  };

  readonly retain = (triggers: readonly WatchTrigger[]): void => {
    this.assertReady();
    const keep = new Set(triggers.map(triggerOf));
    for (const [id, entry] of this.states)
      if (!keep.has(triggerOf(entry.key))) this.states.delete(id);
    background(
      this.host.call('signalWatchState', 'retain', triggers),
      'automation.watch_state_write_failed',
      { triggers: triggers.length },
    );
  };

  private assertReady(): void {
    if (!this.ready) throw new WatchStateNotLoadedError();
  }

  private async fill(): Promise<void> {
    for (const entry of await this.host.call('signalWatchState', 'all'))
      this.states.set(keyOf(entry.key), entry);
    this.ready = true;
  }
}
