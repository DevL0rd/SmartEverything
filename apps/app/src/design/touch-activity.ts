const STALE_MS = 10_000;

let startedAt = 0;
let endedAt = 0;

export function touchBegan(): void {
  startedAt = Date.now();
}

export function touchEnded(): void {
  endedAt = Date.now();
}

export function touchQuietIn(quietMs: number): number {
  const now = Date.now();
  if (startedAt > endedAt && now - startedAt < STALE_MS) {
    return quietMs;
  }
  return Math.max(0, endedAt + quietMs - now);
}
