import type { WatchStateStore } from '../../src/signals/signal-watchers';
import type {
  WatchKey,
  WatchState,
  WatchTrigger,
} from '../../src/store/repositories/signal-watch-state';

export class MemoryWatchState implements WatchStateStore {
  readonly rows = new Map<string, WatchState>();
  saves = 0;

  load = (key: WatchKey): WatchState | null => this.rows.get(MemoryWatchState.keyOf(key)) ?? null;

  save = (key: WatchKey, state: WatchState): void => {
    this.saves += 1;
    this.rows.set(MemoryWatchState.keyOf(key), state);
  };

  retain = (triggers: readonly WatchTrigger[]): void => {
    const kept = new Set(
      triggers.map((trigger) => `${trigger.automationId}|${trigger.triggerId}|`),
    );
    for (const key of [...this.rows.keys()]) {
      if (![...kept].some((prefix) => key.startsWith(prefix))) this.rows.delete(key);
    }
  };

  private static keyOf(key: WatchKey): string {
    return `${key.automationId}|${key.triggerId}|${key.partition}`;
  }
}
