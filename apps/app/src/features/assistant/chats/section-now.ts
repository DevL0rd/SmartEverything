import { DAY_MS, localDayKey } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import type { ChatEntry } from './chat-entry';

const WEEK_MS = 7 * DAY_MS;

interface SectionMoment {
  readonly now: number;
  readonly pool: readonly ChatEntry[];
  readonly timeZone: string | null;
  readonly key: string;
}

export function sectionKeyOf(
  pool: readonly ChatEntry[],
  now: number,
  timeZone: string | null,
): string {
  const recent = pool.filter((entry) => now - Date.parse(entry.at) < WEEK_MS).length;
  return `${localDayKey(now, timeZone)}|${String(recent)}`;
}

function sameMoment(left: SectionMoment, right: SectionMoment): boolean {
  return left.pool === right.pool && left.timeZone === right.timeZone && left.key === right.key;
}

export function useSectionNow(pool: readonly ChatEntry[], timeZone: string | null): number {
  return useMinuteOf(
    (now) => ({ now, pool, timeZone, key: sectionKeyOf(pool, now, timeZone) }),
    sameMoment,
  ).now;
}
