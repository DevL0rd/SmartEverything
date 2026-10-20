import type { Cancel, Clock } from '../clock';
import type { WatchState } from '../store/repositories/signal-watch-state';

const MINUTE_MS = 60_000;

export interface WatchPersistence {
  readonly load: () => WatchState | null;
  readonly save: (state: WatchState) => void;
}

const BLANK: WatchState = { lastSeenMs: null, period: null, latched: false };

export class WatchMemory {
  private state: WatchState;
  private savedSeenMs: number | null;
  private pendingWrite: Cancel | null = null;
  private dirty = false;

  constructor(
    private readonly persistence: WatchPersistence | null,
    private readonly clock: Pick<Clock, 'at'>,
  ) {
    this.state = persistence?.load() ?? BLANK;
    this.savedSeenMs = this.state.lastSeenMs;
  }

  get lastSeenMs(): number | null {
    return this.state.lastSeenMs;
  }

  get period(): string | null {
    return this.state.period;
  }

  get latched(): boolean {
    return this.state.latched;
  }

  change(change: Partial<WatchState>): void {
    this.state = { ...this.state, ...change };
    this.write();
  }

  seen(atMs: number): void {
    this.state = { ...this.state, lastSeenMs: atMs };
    if (this.persistence === null) return;
    if (this.savedSeenMs === null || atMs - this.savedSeenMs >= MINUTE_MS) {
      this.write();
      return;
    }
    this.dirty = true;
    this.pendingWrite ??= this.clock.at(new Date(this.savedSeenMs + MINUTE_MS), () => {
      this.pendingWrite = null;
      this.flush();
    });
  }

  flush(): void {
    this.pendingWrite?.();
    this.pendingWrite = null;
    if (this.dirty) this.write();
  }

  private write(): void {
    this.pendingWrite?.();
    this.pendingWrite = null;
    this.dirty = false;
    this.savedSeenMs = this.state.lastSeenMs;
    this.persistence?.save(this.state);
  }
}
