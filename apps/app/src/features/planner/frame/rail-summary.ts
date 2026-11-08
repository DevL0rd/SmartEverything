import type {
  PlannerDay,
  PlannerItemRow,
  PlannerStats,
  PlannerSummary,
} from '@smarteverything/domain';
import { clock } from '../../../format/time';

type Occurrence = PlannerDay['upcoming'][number];

export function todaySummaryOf(summary: PlannerSummary | null): string | null {
  if (summary === null) return null;
  const parts = [
    ...(summary.missed > 0 ? [`${String(summary.missed)} missed`] : []),
    ...(summary.left > 0 ? [`${String(summary.left)} left`] : []),
  ];
  return parts.length === 0 ? null : parts.join(' · ');
}

export function isOpenTask(item: PlannerItemRow): boolean {
  return (
    item.kind === 'task' &&
    item.status === 'open' &&
    item.deleted_at === null &&
    item.parent_id === null
  );
}

export function tasksSummaryOf(items: readonly PlannerItemRow[]): string | null {
  const open = items.filter(isOpenTask).length;
  return open === 0 ? null : `${String(open)} open`;
}

function startOf(occurrence: Occurrence): number | null {
  return occurrence.start === null ? null : Date.parse(occurrence.start);
}

function nextEventOf(day: PlannerDay, now: number): Occurrence | null {
  return [...day.current, ...day.upcoming].reduce<Occurrence | null>((best, occurrence) => {
    const start = startOf(occurrence);
    if (occurrence.kind !== 'event' || occurrence.all_day || start === null) return best;
    if (start < now) return best;
    const bestStart = best === null ? null : startOf(best);
    return bestStart === null || start < bestStart ? occurrence : best;
  }, null);
}

export function calendarSummaryOf(day: PlannerDay | null, now: number): string | null {
  if (day === null) return null;
  const next = nextEventOf(day, now);
  if (next === null) return null;
  const { title, start } = next;
  return start === null ? null : `${title} ${clock(start, day.time_zone)}`;
}

export function insightsSummaryOf(stats: PlannerStats | null): string | null {
  if (stats === null) return null;
  const { on_time: onTime, late } = stats.on_time;
  const total = onTime + late;
  return total === 0 ? null : `On time ${String(Math.round((onTime / total) * 100))} %`;
}

export function plannerSubtitleOf(date: string, summary: string | null): string {
  return summary === null ? date : `${date} · ${summary}`;
}
