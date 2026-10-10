import type { LiveChange, Snapshot } from '@smarteverything/domain';
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
    const next = change(this.state);
    if (next === this.state) {
      return;
    }
    this.state = next;
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
        : { ...applied, sync: { ...applied.sync, seq: last.seq } };
    });
  }

  replace(snapshot: Snapshot): void {
    this.update((state) => replaceWith(state, snapshot));
  }

  setSync(sync: Partial<SyncState>): void {
    this.update((state) => ({ ...state, sync: { ...state.sync, ...sync } }));
  }

  appendLog(lines: readonly string[]): void {
    this.update((state) => ({
      ...state,
      serviceLog: [...state.serviceLog, ...lines].slice(-SERVICE_LOG_KEPT),
    }));
  }
}
