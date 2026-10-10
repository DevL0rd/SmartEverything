import { MINUTE_MS, localDayKey } from '../../../format/time';

const RUN_WINDOW_MS = 10 * MINUTE_MS;

export interface Run<T> {
  readonly items: readonly T[];
  readonly oldest: string;
}

interface OpenRun<T> {
  readonly items: T[];
  oldest: string;
}

export function runsOf<T>(
  newestFirst: readonly T[],
  keyOf: (item: T) => string,
  atOf: (item: T) => string,
): Run<T>[] {
  const runs: OpenRun<T>[] = [];
  const open = new Map<string, OpenRun<T>>();
  for (const item of newestFirst) {
    const key = keyOf(item);
    const current = open.get(key);
    if (
      current !== undefined &&
      Date.parse(current.oldest) - Date.parse(atOf(item)) <= RUN_WINDOW_MS
    ) {
      current.items.push(item);
      current.oldest = atOf(item);
      continue;
    }
    const run: OpenRun<T> = { items: [item], oldest: atOf(item) };
    open.set(key, run);
    runs.push(run);
  }
  return runs;
}

export interface DayGroup<T> {
  readonly key: string;
  readonly items: readonly T[];
}

export function daysOf<T>(
  items: readonly T[],
  atOf: (item: T) => string,
  timeZone: string | null,
): DayGroup<T>[] {
  const days = new Map<string, T[]>();
  for (const item of items) {
    const key = localDayKey(atOf(item), timeZone);
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return [...days].map(([key, grouped]) => ({ key, items: grouped }));
}
