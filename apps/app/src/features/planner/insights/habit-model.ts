import type { PlannerItemRow, PlannerOccurrenceRow } from '@smarteverything/domain';
import type { HeatDay } from '../../../components/charts';
import { compareText } from '../../../format/text';
import { localDayKey } from '../../../format/time';
import { isOpenTask } from '../frame/rail-summary';
import {
  habitStreakOf,
  occurrenceDayOf,
  occurrencesByItem,
  type HabitStreak,
} from '../tasks/habits';
import { heatDaysOf } from './insights-model';

export interface HabitView {
  readonly item: PlannerItemRow;
  readonly heat: readonly HeatDay[];
  readonly done: number;
  readonly streak: HabitStreak;
}

const NO_OCCURRENCES: readonly PlannerOccurrenceRow[] = [];

function doneCounts(
  occurrences: readonly PlannerOccurrenceRow[],
  days: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of occurrences) {
    const day = occurrenceDayOf(row.occurrence_key);
    if (row.status !== 'done' || day === null || !days.has(day)) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

function isHabit(item: PlannerItemRow): boolean {
  return isOpenTask(item) && item.rrule !== null;
}

export function habitViewsOf(
  items: readonly PlannerItemRow[],
  occurrences: readonly PlannerOccurrenceRow[],
  days: readonly string[],
): readonly HabitView[] {
  const byItem = occurrencesByItem(occurrences);
  const inRange = new Set(days);
  return items
    .filter(isHabit)
    .sort((left, right) => left.position - right.position || compareText(left.title, right.title))
    .map((item) => {
      const own = byItem.get(item.id) ?? NO_OCCURRENCES;
      const counts = doneCounts(own, inRange);
      return {
        item,
        heat: heatDaysOf(days, counts, localDayKey(item.created_at)),
        done: [...counts.values()].reduce((sum, value) => sum + value, 0),
        streak: habitStreakOf(own),
      };
    });
}
