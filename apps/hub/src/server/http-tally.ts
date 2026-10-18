export interface HttpSummary {
  readonly requests: number;
  readonly informational: number;
  readonly success: number;
  readonly redirect: number;
  readonly clientError: number;
  readonly serverError: number;
  readonly aborted: number;
  readonly slow: number;
  readonly meanMs: number;
  readonly maxMs: number;
  readonly slowestRoute: string;
  readonly bytesIn: number;
  readonly bytesOut: number;
  readonly sockets: number;
  readonly socketsOpened: number;
  readonly upgrades: number;
  readonly upgradesRefused: number;
}

export interface Completed {
  readonly status: number;
  readonly durationMs: number;
  readonly aborted: boolean;
  readonly route: string;
  readonly bytesIn: number;
  readonly bytesOut: number;
}

export const SLOW_REQUEST_MS = 1000;

export class HttpTally {
  private requests = 0;
  private classes = [0, 0, 0, 0, 0, 0];
  private aborted = 0;
  private slow = 0;
  private totalMs = 0;
  private maxMs = 0;
  private slowestRoute = '';
  private bytesIn = 0;
  private bytesOut = 0;
  private opened = 0;
  private upgrades = 0;
  private refused = 0;
  private open = 0;

  record(done: Completed): void {
    this.requests += 1;
    const index = Math.min(5, Math.max(0, Math.floor(done.status / 100)));
    this.classes[index] = (this.classes[index] ?? 0) + 1;
    if (done.aborted) this.aborted += 1;
    if (done.durationMs >= SLOW_REQUEST_MS) this.slow += 1;
    this.totalMs += done.durationMs;
    if (done.durationMs > this.maxMs) {
      this.maxMs = done.durationMs;
      this.slowestRoute = done.route;
    }
    this.bytesIn += done.bytesIn;
    this.bytesOut += done.bytesOut;
  }

  connected(): void {
    this.opened += 1;
    this.open += 1;
  }

  disconnected(): void {
    this.open = Math.max(0, this.open - 1);
  }

  upgraded(refused: boolean): void {
    this.upgrades += 1;
    if (refused) this.refused += 1;
  }

  take(): HttpSummary | null {
    if (this.requests === 0 && this.upgrades === 0 && this.opened === 0) return null;
    const summary: HttpSummary = {
      requests: this.requests,
      informational: this.classes[1] ?? 0,
      success: this.classes[2] ?? 0,
      redirect: this.classes[3] ?? 0,
      clientError: this.classes[4] ?? 0,
      serverError: this.classes[5] ?? 0,
      aborted: this.aborted,
      slow: this.slow,
      meanMs: this.requests === 0 ? 0 : Math.round(this.totalMs / this.requests),
      maxMs: Math.round(this.maxMs),
      slowestRoute: this.slowestRoute,
      bytesIn: this.bytesIn,
      bytesOut: this.bytesOut,
      sockets: this.open,
      socketsOpened: this.opened,
      upgrades: this.upgrades,
      upgradesRefused: this.refused,
    };
    this.requests = 0;
    this.classes = [0, 0, 0, 0, 0, 0];
    this.aborted = 0;
    this.slow = 0;
    this.totalMs = 0;
    this.maxMs = 0;
    this.slowestRoute = '';
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.opened = 0;
    this.upgrades = 0;
    this.refused = 0;
    return summary;
  }
}
