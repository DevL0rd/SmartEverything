import { clearWithdrawnLayoutWrites, reconcileLayoutWrites } from './layout-writes';
import type { LiveChange, Snapshot } from '@smarteverything/domain';
import { perfStoreChanged } from '../perf/store-hook';
import { applyChange, replaceWith } from './live-reducers';
import { emptyState, type StoreState, type SyncState } from './state';

const SERVICE_LOG_KEPT = 500;

export class EntityStore {
  private state: StoreState = emptyState();
  private readonly listeners = new Set<() => void>();

  readonly get = (): StoreState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  readonly update = (change: (state: StoreState) => StoreState): void => {
    const changed = change(this.state);
    if (changed === this.state) {
      return;
    }
    const next = clearWithdrawnLayoutWrites(this.state, changed);
    const previous = this.state;
    this.state = next;
    perfStoreChanged(previous, next, this.listeners.size);
    for (const listener of this.listeners) {
      listener();
    }
  };

  apply(changes: readonly LiveChange[]): void {
    if (changes.length === 0) {
      return;
    }
    this.update((state) => {
      const applied = changes.reduce(applyChange, state);
      const last = changes[changes.length - 1];
      return last === undefined
        ? applied
        : reconcileLayoutWrites(
            state,
            { ...applied, sync: { ...applied.sync, seq: last.seq } },
            changes,
          );
    });
  }

  replace(snapshot: Snapshot): void {
    this.update((state) =>
      reconcileLayoutWrites(
        state,
        { ...replaceWith(state, snapshot), layoutWritesSuspended: false },
        null,
      ),
    );
  }

  setSync(sync: Partial<SyncState>): void {
    this.update((state) => ({
      ...state,
      sync: { ...state.sync, ...sync },
      layoutWriteEpoch: state.layoutWriteEpoch + (sync.status === 'loading' ? 1 : 0),
      layoutWritesSuspended: sync.status === 'loading' || state.layoutWritesSuspended,
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
