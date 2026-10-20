import { zonedDateFormat } from '../../format/locale';
import { clock, hoursMinutes, shortDate, weekdayShort } from '../../format/time';
import { barPath, type BarBox } from './bar-path';
import { hourLabel } from './night-axis';
import type { HypnogramStage } from './hypnogram-model';

export type BarsSpan = 'week' | 'month' | 'year';

export const AXIS_START = 20 * 60;
export const AXIS_END = 36 * 60;
export const CLOCK_TICK_STEP = 120;
export const NIGHT_BAR_HEIGHT = 200;
export const GUTTER_LEFT_W = 44;
export const GUTTER_RIGHT_PHONE_W = 72;
export const GUTTER_RIGHT_DESKTOP_W = 80;

const DAY_MINUTES = 24 * 60;
const NOON = 12 * 60;
const WEEK_BAR_MAX = 30;
const WEEK_BAR_SHARE = 0.58;
const MONTH_BAR_MIN = 4;
const MONTH_BAR_GAP = 3;
const YEAR_BAR_MAX = 22;
const YEAR_BAR_SHARE = 0.6;
const MIN_BAR_PX = 4;
const MONDAY = 1;

const YEAR_MONTH = zonedDateFormat({ month: 'short', year: 'numeric' });
const MONTH_NAME = zonedDateFormat({ month: 'short' });

export interface WindowNight {
  readonly bed: number;
  readonly wake: number;
  readonly asleepMinutes: number;
}

export interface WindowNap {
  readonly start: number;
  readonly end: number;
}

export interface WindowColumn {
  readonly key: string;
  readonly at: number;
  readonly night: WindowNight | null;
  readonly nap: WindowNap | null;
}

export interface ColumnLabel {
  readonly primary: string;
  readonly secondary: string;
}

export interface ReadoutRow {
  readonly label: string;
  readonly value: string;
  readonly stage: HypnogramStage | null;
}

export interface ColumnReadout {
  readonly heading: string;
  readonly rows: readonly ReadoutRow[];
  readonly text: string;
}

export interface Slot {
  readonly centre: number;
  readonly width: number;
}

export function rectPath(box: BarBox, radius = 0): string {
  return barPath(box, { top: radius, bottom: radius });
}

export function minuteClock(minuteOfDay: number): string {
  return clock(new Date(2000, 0, 1, 0, Math.round(minuteOfDay)));
}

export function axisMinute(minuteOfDay: number, towards: 'top' | 'bottom'): number {
  if (minuteOfDay < NOON) {
    return minuteOfDay + DAY_MINUTES;
  }
  if (minuteOfDay < AXIS_START) {
    return towards === 'top' ? AXIS_START : AXIS_END;
  }
  return minuteOfDay;
}

export function isOnAxis(minuteOfDay: number): boolean {
  return minuteOfDay < NOON || minuteOfDay >= AXIS_START;
}

export function axisShare(axisMinuteValue: number): number {
  const share = (axisMinuteValue - AXIS_START) / (AXIS_END - AXIS_START);
  return Math.min(1, Math.max(0, share));
}

export function clockTicks(): readonly number[] {
  const ticks: number[] = [];
  for (let minute = AXIS_START; minute <= AXIS_END; minute += CLOCK_TICK_STEP) {
    ticks.push(minute);
  }
  return ticks;
}

export function clockTickLabel(axisMinuteValue: number): string {
  return hourLabel(new Date(2000, 0, 1, 0, Math.round(axisMinuteValue % DAY_MINUTES)));
}

export interface ShareSpan {
  readonly from: number;
  readonly to: number;
}

export function nightShares(night: WindowNight): ShareSpan {
  return {
    from: axisShare(axisMinute(night.bed, 'top')),
    to: axisShare(axisMinute(night.wake, 'bottom')),
  };
}

export function usualShares(usualBed: number, usualWake: number): ShareSpan {
  return nightShares({ bed: usualBed, wake: usualWake, asleepMinutes: 0 });
}

export type NapMark =
  { readonly kind: 'bar'; readonly from: number; readonly to: number } | { readonly kind: 'dot' };

export function napMarkOf(nap: WindowNap): NapMark {
  if (!isOnAxis(nap.start) || !isOnAxis(nap.end)) {
    return { kind: 'dot' };
  }
  return {
    kind: 'bar',
    from: axisShare(axisMinute(nap.start, 'top')),
    to: axisShare(axisMinute(nap.end, 'bottom')),
  };
}

export function bandShares(usual: number, within: number): ShareSpan {
  const centre = axisMinute(usual, 'top');
  return { from: axisShare(centre - within), to: axisShare(centre + within) };
}

export function barWidthOf(span: BarsSpan, slot: number): number {
  switch (span) {
    case 'week':
      return Math.min(WEEK_BAR_MAX, slot * WEEK_BAR_SHARE);
    case 'month':
      return Math.max(MONTH_BAR_MIN, slot - MONTH_BAR_GAP);
    case 'year':
      return Math.min(YEAR_BAR_MAX, slot * YEAR_BAR_SHARE);
  }
}

export function slotsOf(span: BarsSpan, count: number, left: number, right: number): Slot[] {
  const slot = count === 0 ? 0 : (right - left) / count;
  return Array.from({ length: count }, (_, index) => ({
    centre: left + slot * index + slot / 2,
    width: barWidthOf(span, slot),
  }));
}

export function columnAt(count: number, left: number, right: number, x: number): number {
  if (count === 0) {
    return 0;
  }
  const slot = (right - left) / count;
  return Math.min(count - 1, Math.max(0, Math.floor((x - left) / slot)));
}

export function stepColumn(
  count: number,
  current: number | null,
  direction: 1 | -1,
): number | null {
  if (count === 0) {
    return null;
  }
  if (current === null) {
    return direction === 1 ? 0 : count - 1;
  }
  return Math.min(count - 1, Math.max(0, current + direction));
}

export const TOP_PAD = 8;
export const AXIS_WEEK_H = 34;
export const AXIS_DENSE_H = 20;

export interface BarsFrame {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly plotHeight: number;
  readonly axisHeight: number;
}

export function barsFrameOf(input: {
  readonly width: number;
  readonly height: number;
  readonly span: BarsSpan;
  readonly wide: boolean;
}): BarsFrame {
  const axisHeight = input.span === 'week' ? AXIS_WEEK_H : AXIS_DENSE_H;
  const gutter = input.wide ? GUTTER_RIGHT_DESKTOP_W : GUTTER_RIGHT_PHONE_W;
  return {
    width: input.width,
    height: input.height,
    left: GUTTER_LEFT_W,
    right: Math.max(GUTTER_LEFT_W + 1, input.width - gutter),
    top: TOP_PAD,
    plotHeight: Math.max(1, input.height - TOP_PAD - axisHeight),
    axisHeight,
  };
}

export function barPixels(from: number, to: number, plotHeight: number): ShareSpan {
  const top = from * plotHeight;
  const bottom = Math.max(to * plotHeight, top + MIN_BAR_PX);
  return { from: top, to: bottom };
}

function dayOfMonth(at: number): string {
  return String(new Date(at).getDate());
}

export function columnLabel(span: BarsSpan, at: number, compact: boolean): ColumnLabel {
  switch (span) {
    case 'week': {
      const name = weekdayShort(at);
      return { primary: compact ? name.slice(0, 1) : name, secondary: dayOfMonth(at) };
    }
    case 'month':
      return {
        primary: new Date(at).getDay() === MONDAY ? shortDate(at) : '',
        secondary: '',
      };
    case 'year':
      return { primary: MONTH_NAME(null).format(new Date(at)).slice(0, 1), secondary: '' };
  }
}

export function columnName(span: BarsSpan, at: number): string {
  return span === 'year'
    ? YEAR_MONTH(null).format(new Date(at))
    : `${weekdayShort(at)} ${dayOfMonth(at)}`;
}

export function napMinutes(nap: WindowNap): number {
  return (nap.end - nap.start + DAY_MINUTES) % DAY_MINUTES;
}

export const NO_DATA: ReadoutRow = { label: 'No data', value: '', stage: null };

export function windowReadout(span: BarsSpan, column: WindowColumn): ColumnReadout {
  const name = columnName(span, column.at);
  const { night, nap } = column;
  if (night === null) {
    return { heading: name, rows: [NO_DATA], text: `${name} · No data` };
  }
  const bed = minuteClock(night.bed);
  const wake = minuteClock(night.wake);
  const asleep = hoursMinutes(night.asleepMinutes);
  const rows: ReadoutRow[] = [
    { label: 'Bed', value: bed, stage: 'asleep' },
    { label: 'Wake', value: wake, stage: 'asleep' },
    { label: 'Asleep', value: asleep, stage: 'asleep' },
  ];
  const napText = nap === null ? '' : ` · Nap ${minuteClock(nap.start)} – ${minuteClock(nap.end)}`;
  if (nap !== null) {
    const length = hoursMinutes(napMinutes(nap));
    rows.push({ label: 'Nap', value: length, stage: null });
  }
  return { heading: name, rows, text: `${name} · ${bed} – ${wake} · ${asleep} asleep${napText}` };
}

export function recordedText(count: number, total: number, span: BarsSpan): string {
  const unit = span === 'year' ? 'months' : 'nights';
  return `${String(count)} of ${String(total)} ${unit} recorded`;
}

export function windowSummary(
  label: string,
  span: BarsSpan,
  columns: readonly WindowColumn[],
  usual: { readonly bed: number; readonly wake: number } | null,
): string {
  const recorded = columns.filter((column) => column.night !== null).length;
  const usualText =
    usual === null
      ? ''
      : ` Usual bedtime ${minuteClock(usual.bed)}, usual wake-up ${minuteClock(usual.wake)}.`;
  return `${label}, ${recordedText(recorded, columns.length, span)}.${usualText}`;
}
