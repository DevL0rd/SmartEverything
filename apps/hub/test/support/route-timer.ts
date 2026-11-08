import type { RouteTimer } from '../../src/vacuum/live-route';

interface Entry {
  readonly ms: number;
  readonly run: () => void;
  cancelled: boolean;
  fired: boolean;
}

export function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export class FakeRouteTimer implements RouteTimer {
  private readonly entries: Entry[] = [];

  readonly after = (ms: number, run: () => void): (() => void) => {
    const entry: Entry = { ms, run, cancelled: false, fired: false };
    this.entries.push(entry);
    return (): void => {
      entry.cancelled = true;
    };
  };

  armed(): number {
    return this.entries.filter((entry) => !entry.cancelled && !entry.fired).length;
  }

  lastDelay(): number | undefined {
    return this.entries.at(-1)?.ms;
  }

  async fire(): Promise<void> {
    const entry = this.entries.find((candidate) => !candidate.cancelled && !candidate.fired);
    if (entry === undefined) throw new Error('no timer is armed');
    entry.fired = true;
    entry.run();
    await flush();
  }

  async fireCancelled(): Promise<void> {
    for (const entry of this.entries.filter((candidate) => candidate.cancelled)) {
      if (!entry.fired) {
        entry.fired = true;
        entry.run();
      }
    }
    await flush();
  }
}
