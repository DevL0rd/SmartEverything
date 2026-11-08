import type { AssistantMessageRow } from '@smarteverything/domain';
import { dayLabel, localDayKey } from '../../../format/time';

interface DayOptions {
  readonly now: number;
  readonly timeZone: string | null;
}

interface DayFacts {
  readonly key: string;
  readonly name: string;
}

interface DayCache {
  readonly now: number;
  readonly timeZone: string | null;
  readonly facts: Map<string, DayFacts>;
}

let dayCache: DayCache = { now: 0, timeZone: null, facts: new Map() };

export function dayFactsOf(createdAt: string, options: DayOptions): DayFacts {
  const { now, timeZone } = options;
  if (dayCache.now !== now || dayCache.timeZone !== timeZone) {
    dayCache = { now, timeZone, facts: new Map() };
  }
  const known = dayCache.facts.get(createdAt);
  if (known !== undefined) return known;
  const made = { key: localDayKey(createdAt, timeZone), name: dayLabel(createdAt, now, timeZone) };
  dayCache.facts.set(createdAt, made);
  return made;
}

export function sameDay(
  left: AssistantMessageRow,
  right: AssistantMessageRow,
  options: DayOptions,
): boolean {
  return dayFactsOf(left.created_at, options).key === dayFactsOf(right.created_at, options).key;
}
