import type { LiveChange, Snapshot } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { LogTally } from '../design/log-tally';
import { perfStoreChanged } from '../perf/store-hook';
import { applyChange, replaceWith } from './live-reducers';
import { emptyState, type StoreState, type SyncState } from './state';
import { changedSlices, SubscriptionManager, type Slice } from './subscriptions';

const SERVICE_LOG_KEPT = 500;

const log = new Logger('app.store');

function tableSizes(tables: object): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) {
    sizes[name] = Array.isArray(rows) ? rows.length : -1;
  }
  return sizes;
}

class Listeners {
  private readonly all = new Set<() => void>();

  readonly add = (listener: () => void): (() => void) => {
    this.all.add(listener);
    return (): void => {
      this.all.delete(listener);
    };
  };

  get size(): number {
    return this.all.size;
  }

  notify(): void {
    for (const listener of this.all) {
      listener();
    }
  }
}

function offlineSinceOf(status: SyncState['status'], since: number | null): number | null {
  if (status === 'live') return null;
  return since ?? Date.now();
}

export class EntityStore {
  private state: StoreState = emptyState();
  private readonly watchers = new Listeners();
  readonly subscriptions = new SubscriptionManager();
  private readonly tally = new LogTally(log, 'store.summarised', 5000, () => ({
    watchers: this.watchers.size,
    subscribers: this.subscriptions.size,
    seq: this.state.sync.seq,
    status: this.state.sync.status,
  }));
  private frameQueued = false;
  private microtaskQueued = false;

  readonly get = (): StoreState => this.state;

  readonly subscribe = this.watchers.add;

  readonly subscribeRender = (listener: () => void): (() => void) =>
    this.subscriptions.add({ reads: new Set(), wake: listener });

  readonly subscribeSlices = (reads: readonly Slice[], listener: () => void): (() => void) =>
    this.subscriptions.add({ reads: new Set(reads), wake: listener });

  readonly update = (change: (state: StoreState) => StoreState): void => {
    if (this.commit(change)) {
      this.renderSoon();
    }
  };

  apply(changes: readonly LiveChange[]): void {
    if (changes.length === 0) {
      return;
    }
    const committed = this.commit((state) => {
      const applied = changes.reduce(applyChange, state);
      const last = changes[changes.length - 1];
      return last === undefined
        ? applied
        : { ...applied, sync: { ...applied.sync, seq: last.seq } };
    });
    if (committed) {
      this.renderNextFrame();
    }
  }

  private commit(change: (state: StoreState) => StoreState): boolean {
    const next = change(this.state);
    if (next === this.state) {
      return false;
    }
    const previous = this.state;
    this.state = next;
    const changed = changedSlices(previous, next);
    this.tally.bump('commits');
    this.tally.bump('slicesChanged', changed.size);
    this.subscriptions.mark(changed);
    perfStoreChanged(previous, next, this.watchers.size + this.subscriptions.size);
    this.watchers.notify();
    return true;
  }

  private renderNextFrame(): void {
    if (this.frameQueued) {
      return;
    }
    this.frameQueued = true;
    requestAnimationFrame(() => {
      if (this.frameQueued) this.render();
    });
  }

  private renderSoon(): void {
    if (this.microtaskQueued) {
      return;
    }
    this.microtaskQueued = true;
    queueMicrotask(() => {
      if (this.microtaskQueued) this.render();
    });
  }

  private render(): void {
    this.frameQueued = false;
    this.microtaskQueued = false;
    const woken = this.subscriptions.flush();
    this.tally.bump('renders');
    this.tally.bump('subscribersWoken', woken);
  }

  replace(snapshot: Snapshot): void {
    log.debug('store.replaced', () => ({
      seq: snapshot.seq,
      tables: tableSizes(snapshot.tables),
    }));
    this.update((state) => replaceWith(state, snapshot));
  }

  setSync(sync: Partial<Omit<SyncState, 'offlineSince'>>): void {
    this.update((state) => ({
      ...state,
      sync: {
        ...state.sync,
        ...sync,
        offlineSince: offlineSinceOf(sync.status ?? state.sync.status, state.sync.offlineSince),
      },
    }));
  }

  appendLog(lines: readonly string[]): void {
    if (lines.length === 0) return;
    this.update((state) => ({
      ...state,
      serviceLog: [...state.serviceLog, ...lines].slice(-SERVICE_LOG_KEPT),
    }));
  }
}
