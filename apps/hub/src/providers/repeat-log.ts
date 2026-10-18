import type { Logger } from '@smarteverything/logging';

type RepeatLevel = 'debug' | 'info' | 'warn';

interface Tally {
  lastAt: number;
  suppressed: number;
}

const DEFAULT_WINDOW_MS = 30_000;

const TALLY_LIMIT = 256;

export class RepeatLog {
  private readonly tallies = new Map<string, Tally>();

  constructor(
    private readonly log: Logger,
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  emit(
    level: RepeatLevel,
    event: string,
    key: string,
    payload: Readonly<Record<string, unknown>> = {},
  ): void {
    const at = this.now();
    const tally = this.tallies.get(key);
    if (tally !== undefined && at - tally.lastAt < this.windowMs) {
      tally.suppressed += 1;
      return;
    }
    const suppressed = tally?.suppressed ?? 0;
    this.remember(key, at);
    this.log[level](
      event,
      suppressed === 0 ? payload : { ...payload, suppressed, windowMs: this.windowMs },
    );
  }

  warn(event: string, key: string, payload?: Readonly<Record<string, unknown>>): void {
    this.emit('warn', event, key, payload);
  }

  info(event: string, key: string, payload?: Readonly<Record<string, unknown>>): void {
    this.emit('info', event, key, payload);
  }

  debug(event: string, key: string, payload?: Readonly<Record<string, unknown>>): void {
    this.emit('debug', event, key, payload);
  }

  private remember(key: string, at: number): void {
    if (this.tallies.size >= TALLY_LIMIT) {
      for (const [known, tally] of this.tallies) {
        if (at - tally.lastAt >= this.windowMs) {
          this.tallies.delete(known);
        }
      }
    }
    this.tallies.set(key, { lastAt: at, suppressed: 0 });
  }
}
