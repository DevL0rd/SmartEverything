import { PLANNER_CALENDAR_VIEWS } from '@smarteverything/domain';
import { dateFormat } from '../../../format/locale';
import { addDays, dayLabelOf, monthOf, shiftMonth } from './month-model';
import { daysFrom } from './time-grid-layout';

export type CalendarView = (typeof PLANNER_CALENDAR_VIEWS)[number];

export type TimeView = 'day' | 'three_days' | 'week';

const SPAN: Readonly<Record<TimeView, number>> = { day: 1, three_days: 3, week: 7 };

const MONTH_YEAR = dateFormat({ month: 'long', year: 'numeric', timeZone: 'UTC' });

const MONTH = dateFormat({ month: 'long', timeZone: 'UTC' });

export function isTimeView(view: CalendarView): view is TimeView {
  return view === 'day' || view === 'three_days' || view === 'week';
}

export function viewsFor(owner: boolean): readonly CalendarView[] {
  return PLANNER_CALENDAR_VIEWS.filter((view) => owner || view !== 'people');
}

export function viewOfKey(key: string, views: readonly CalendarView[]): CalendarView | null {
  const view = PLANNER_CALENDAR_VIEWS[Number(key) - 1];
  return view !== undefined && views.includes(view) ? view : null;
}

export function weekStartOf(day: string, weekStart: number): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday - weekStart + 7) % 7));
}

export function windowDaysOf(view: TimeView, day: string, weekStart: number): readonly string[] {
  return view === 'week' ? daysFrom(weekStartOf(day, weekStart), 7) : daysFrom(day, SPAN[view]);
}

export function steppedDay(view: CalendarView, day: string, by: number): string {
  if (isTimeView(view)) return addDays(day, by * SPAN[view]);
  if (view === 'people') return addDays(day, by);
  if (view === 'year') return `${String(Number(day.slice(0, 4)) + by)}-01-01`;
  return `${shiftMonth(monthOf(day), by)}-01`;
}

function dayNumber(day: string): string {
  return String(Number(day.slice(8, 10)));
}

function spanTitleOf(days: readonly string[]): string {
  const first = days[0] ?? '';
  const last = days[days.length - 1] ?? first;
  if (first === last) return dayLabelOf(first, true);
  const lastText = `${dayNumber(last)} ${MONTH.format(new Date(`${last}T00:00:00Z`))}`;
  if (monthOf(first) === monthOf(last)) return `${dayNumber(first)} to ${lastText}`;
  return `${dayNumber(first)} ${MONTH.format(new Date(`${first}T00:00:00Z`))} to ${lastText}`;
}

export function titleOf(view: CalendarView, day: string, weekStart: number): string {
  if (isTimeView(view)) return spanTitleOf(windowDaysOf(view, day, weekStart));
  if (view === 'people') return dayLabelOf(day, true);
  if (view === 'year') return day.slice(0, 4);
  if (view === 'agenda') return `From ${dayLabelOf(day, true)}`;
  return MONTH_YEAR.format(new Date(`${monthOf(day)}-01T00:00:00Z`));
}

export type KeyAction =
  | { readonly kind: 'view'; readonly view: CalendarView }
  | { readonly kind: 'step'; readonly by: number }
  | { readonly kind: 'today' };

export function keyActionOf(key: string, views: readonly CalendarView[]): KeyAction | null {
  if (key === 'ArrowLeft') return { kind: 'step', by: -1 };
  if (key === 'ArrowRight') return { kind: 'step', by: 1 };
  if (key === 't' || key === 'T') return { kind: 'today' };
  const view = viewOfKey(key, views);
  return view === null ? null : { kind: 'view', view };
}
