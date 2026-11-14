import { zonedDateFormat } from '../../../format/locale';
import { count } from '../../../format/number';

const UTC = 'UTC';
const MONTH_SHORT = zonedDateFormat({ month: 'short' });
const DAY_ONLY = zonedDateFormat({ day: 'numeric' });
const MONTH_NAME = zonedDateFormat({ month: 'long' });
const MONTH_INITIAL = zonedDateFormat({ month: 'narrow' });
const WEEKDAY = zonedDateFormat({ weekday: 'long' });
const WEEKDAY_SHORT = zonedDateFormat({ weekday: 'short' });
const MONTH_YEAR = zonedDateFormat({ month: 'short', year: 'numeric' });
const DAY_MS = 86_400_000;

function instantOf(day: string): Date {
  const instant = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(instant)) throw new RangeError(`${day} is not a calendar day`);
  return new Date(instant);
}

function monthStart(month: string): Date {
  return instantOf(`${month}-01`);
}

export function yearOf(day: string): number {
  return instantOf(day).getUTCFullYear();
}

function dayNumber(day: string): string {
  return DAY_ONLY(UTC).format(instantOf(day));
}

function dayMonth(day: string): string {
  return `${dayNumber(day)} ${MONTH_SHORT(UTC).format(instantOf(day))}`;
}

export function longDay(day: string): string {
  return `${dayNumber(day)} ${MONTH_NAME(UTC).format(instantOf(day))} ${String(yearOf(day))}`;
}

export function weekdayOf(day: string): string {
  return WEEKDAY(UTC).format(instantOf(day));
}

export function shortDay(day: string): string {
  return `${WEEKDAY_SHORT(UTC).format(instantOf(day))} ${dayMonth(day)}`;
}

export function monthName(month: string): string {
  return MONTH_NAME(UTC).format(monthStart(month));
}

export function monthYear(day: string): string {
  return MONTH_YEAR(UTC).format(instantOf(day));
}

export function monthInitial(month: string): string {
  return MONTH_INITIAL(UTC).format(monthStart(month));
}

export function dayCount(from: string, to: string): number {
  return Math.round((instantOf(to).getTime() - instantOf(from).getTime()) / DAY_MS) + 1;
}

function startText(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return dayNumber(from);
  const start = dayMonth(from);
  return yearOf(from) === yearOf(to) ? start : `${start} ${String(yearOf(from))}`;
}

export function rangeText(from: string, to: string): string {
  const end = `${dayMonth(to)} ${String(yearOf(to))}`;
  return from === to ? end : `${startText(from, to)} to ${end}`;
}

export function itemsText(total: number): string {
  return total === 1 ? '1 item' : `${count(total)} items`;
}

export function daysText(total: number): string {
  return total === 1 ? '1 day' : `${count(total)} days`;
}

export function placesText(total: number): string {
  return total === 1 ? '1 place' : `${count(total)} places`;
}

export function yearsAgoText(years: number): string {
  return years === 1 ? '1 year ago' : `${count(years)} years ago`;
}

export function kilometres(km: number): string {
  return count(Math.round(km));
}

export function shotsText(total: number): string {
  return total === 1 ? '1 shot' : `${count(total)} shots`;
}
