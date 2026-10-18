import type { UsageBucket } from '@smarteverything/domain';
import { DAY_MS } from '../../../format/time';
import type { CostParams, CostRange } from './costs-params';
import { dateFormat } from '../../../format/locale';

export const RANGE_LABELS: Readonly<Record<CostRange, string>> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  month: 'This month',
  custom: 'Custom',
};

export interface CostWindow {
  readonly from: string;
  readonly to: string;
  readonly firstDay: string;
  readonly lastDay: string;
  readonly days: number;
  readonly bucket: UsageBucket;
}

const OFFSET = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/;

function offsetMinutes(at: number, timeZone: string): number {
  const name = dateFormat({ timeZone, timeZoneName: 'shortOffset' }, 'en-US')
    .formatToParts(new Date(at))
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = OFFSET.exec(name ?? '');
  if (match === null) {
    return 0;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? '0');
  return match[1] === '-' ? -minutes : minutes;
}

function zonedMidnight(day: string, timeZone: string): number {
  const utc = Date.parse(`${day}T00:00:00Z`);
  return utc - offsetMinutes(utc, timeZone) * 60_000;
}

export function shiftDays(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
}

function spanOf(
  params: CostParams,
  today: string,
): { readonly first: string; readonly last: string } {
  switch (params.range) {
    case 'today':
      return { first: today, last: today };
    case '7d':
      return { first: shiftDays(today, -6), last: today };
    case 'month':
      return { first: `${today.slice(0, 7)}-01`, last: today };
    case 'custom':
      return customSpan(params, today);
    case '30d':
      return { first: shiftDays(today, -29), last: today };
  }
}

function customSpan(
  params: CostParams,
  today: string,
): { readonly first: string; readonly last: string } {
  const last = params.to === undefined || params.to > today ? today : params.to;
  const first = params.from === undefined || params.from > last ? last : params.from;
  return { first, last };
}

export function windowOf(params: CostParams, today: string, timeZone: string): CostWindow {
  const { first, last } = spanOf(params, today);
  const days =
    Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS) + 1;
  return {
    from: new Date(zonedMidnight(first, timeZone)).toISOString(),
    to: new Date(zonedMidnight(shiftDays(last, 1), timeZone)).toISOString(),
    firstDay: first,
    lastDay: last,
    days,
    bucket: days === 1 ? 'hour' : 'day',
  };
}

export function rangeLabel(params: CostParams, window: CostWindow): string {
  if (params.range !== 'custom') {
    return RANGE_LABELS[params.range];
  }
  const format = (day: string): string =>
    dateFormat({
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
  return window.firstDay === window.lastDay
    ? format(window.firstDay)
    : `${format(window.firstDay)} – ${format(window.lastDay)}`;
}
