import type { CalendarView } from './calendar-view-model';

export function openingViewOf(
  preferred: CalendarView,
  views: readonly CalendarView[],
  compact: boolean,
): CalendarView {
  const view = views.includes(preferred) ? preferred : 'week';
  return compact && view === 'week' ? 'three_days' : view;
}
