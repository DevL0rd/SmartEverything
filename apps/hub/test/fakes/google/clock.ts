export interface FakeClock {
  now(): Date;
  nowMs(): number;
  iso(): string;
  advance(ms: number): void;
  tick(): void;
}

export function createClock(start: Date, stepMs: number): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    nowMs: () => current,
    iso: () => new Date(current).toISOString(),
    advance: (ms): void => {
      current += ms;
    },
    tick: (): void => {
      current += stepMs;
    },
  };
}
