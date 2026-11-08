import { DAY_KEY, daysBetween } from '../../format/time';
import { zonedDateFormat } from '../../format/locale';
import { count } from '../../format/number';

const WALL_ZONE = 'UTC';
const WEEK_DAYS = 6;

const WEEKDAY = zonedDateFormat({ weekday: 'long' });
const DAY_DATE = zonedDateFormat({ weekday: 'short', day: 'numeric', month: 'short' });
const DAY_DATE_YEAR = zonedDateFormat({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export interface DayText {
  readonly title: string;
  readonly detail: string;
}

function wallDate(day: string): Date {
  return new Date(`${DAY_KEY.parse(day)}T12:00:00Z`);
}

export function itemCount(total: number): string {
  return total === 1 ? '1 item' : `${count(total)} items`;
}

function relativeTitle(day: string, today: string): string | null {
  const age = daysBetween(day, today);
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  if (age > 1 && age <= WEEK_DAYS) return WEEKDAY(WALL_ZONE).format(wallDate(day));
  return null;
}

function datedTitle(day: string, today: string): string {
  const format = day.slice(0, 4) === today.slice(0, 4) ? DAY_DATE : DAY_DATE_YEAR;
  return format(WALL_ZONE).format(wallDate(day));
}

export function dayText(day: string, total: number, today: string): DayText {
  const relative = relativeTitle(day, today);
  if (relative === null) return { title: datedTitle(day, today), detail: itemCount(total) };
  return {
    title: relative,
    detail: `${DAY_DATE(WALL_ZONE).format(wallDate(day))} · ${itemCount(total)}`,
  };
}
