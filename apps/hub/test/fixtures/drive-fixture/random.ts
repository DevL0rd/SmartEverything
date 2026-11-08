export type NonEmpty<T> = readonly [T, ...T[]];

export interface Random {
  next(): number;
  int(limit: number): number;
  between(low: number, high: number): number;
  chance(share: number): boolean;
  hex(length: number): string;
  uuid(): string;
  pick<T>(list: NonEmpty<T>): T;
}

export const NOW_MS = Date.UTC(2026, 10, 7, 10, 0, 0);
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const HISTORY_MS = 3 * 365 * DAY_MS;
export const RETENTION_MS = 30 * DAY_MS;

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const int = (limit: number): number => Math.floor(next() * limit);
  const hex = (length: number): string => {
    let text = '';
    for (let index = 0; index < length; index += 1) {
      text += int(16).toString(16);
    }
    return text;
  };
  return {
    next,
    int,
    between: (low, high) => low + int(high - low + 1),
    chance: (share) => next() < share,
    hex,
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'.charAt(int(4))}${hex(3)}-${hex(12)}`,
    pick: (list) => list[int(list.length)] ?? list[0],
  };
}

export function cycle<T>(list: NonEmpty<T>, index: number): T {
  return list[index % list.length] ?? list[0];
}

export function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}
