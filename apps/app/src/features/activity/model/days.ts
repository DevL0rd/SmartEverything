import { dayLabel } from '../../../format/time';
import type { ActivityItem } from './coalesce';
import { daysOf } from './grouping';

export interface ActivityDay {
  readonly key: string;
  readonly title: string;
  readonly items: readonly ActivityItem[];
}

export function byDay(
  items: readonly ActivityItem[],
  now: number,
  timeZone: string,
): readonly ActivityDay[] {
  return daysOf(items, (item) => item.at, timeZone).map((day) => ({
    key: day.key,
    title: dayLabel(day.items[0]?.at ?? day.key, now, timeZone),
    items: day.items,
  }));
}
