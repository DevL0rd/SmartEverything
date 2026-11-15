import type { PlannerItemRow, PlannerSummary } from '@smarteverything/domain';

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

export function plannerSubtitleOf(date: string, summary: string | null): string {
  return summary === null ? date : `${date} · ${summary}`;
}
