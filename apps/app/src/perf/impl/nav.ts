import { NAV_WINDOW_MS } from './config';

export interface Arrival {
  readonly start: number;
  readonly from: string;
  readonly toMount: number | null;
}

interface Pending {
  start: number;
  from: string;
  toMount: number | null;
}

export class NavTracker {
  private pending: Pending | null = null;

  begin(now: number, from: string): void {
    if (this.pending === null || now - this.pending.start > NAV_WINDOW_MS) {
      this.pending = { start: now, from, toMount: null };
    }
  }

  mounted(now: number): void {
    if (this.pending !== null && this.pending.toMount === null) {
      this.pending.toMount = now - this.pending.start;
    }
  }

  arrive(now: number, from: string): Arrival {
    const fresh = this.pending !== null && now - this.pending.start <= NAV_WINDOW_MS;
    const taken: Arrival =
      fresh && this.pending !== null ? this.pending : { start: now, from, toMount: null };
    this.pending = null;
    return taken;
  }
}
