import { zonedDateFormat } from '../../format/locale';
import { HOUR_MS, MINUTE_MS } from '../../format/time';
import { extentOf } from './scale';

export const NIGHT_GUTTER_W = 44;
export const NIGHT_GUTTER_COMPACT_W = 2;
export const NIGHT_EDGE_PAD = 4;

const LONG_NIGHT_MS = 9 * HOUR_MS;
const SHORT_NIGHT_MS = 4 * HOUR_MS;
const NARROW_PLOT_PX = 360;
const TICK_LABEL_W = 44;

const HOUR_LABEL = zonedDateFormat({ hour: 'numeric' });

export function hourLabel(date: Date): string {
  return HOUR_LABEL(null).format(date);
}

export interface NightWindow {
  readonly from: number;
  readonly to: number;
}

export interface NightFrame {
  readonly window: NightWindow;
  readonly left: number;
  readonly right: number;
}

export type NightTickKind = 'labelled' | 'hour' | 'half';

export interface NightTick {
  readonly at: number;
  readonly kind: NightTickKind;
  readonly label: string | null;
}

export function nightWindow(
  times: Iterable<number>,
  given: Partial<NightWindow> = {},
): NightWindow | null {
  const bounds = extentOf(times);
  const from = given.from ?? bounds?.min;
  const to = given.to ?? bounds?.max;
  return from === undefined || to === undefined ? null : { from, to };
}

export function nightX(frame: NightFrame, at: number): number {
  const span = Math.max(1, frame.window.to - frame.window.from);
  return frame.left + ((at - frame.window.from) / span) * (frame.right - frame.left);
}

export function nightAt(frame: NightFrame, x: number): number {
  const width = Math.max(1, frame.right - frame.left);
  const share = Math.min(1, Math.max(0, (x - frame.left) / width));
  return frame.window.from + share * (frame.window.to - frame.window.from);
}

export function isNarrowNight(plotWidth: number): boolean {
  return plotWidth < NARROW_PLOT_PX;
}

function firstWholeHour(at: number): number {
  const offset = new Date(at).getTimezoneOffset() * MINUTE_MS;
  return Math.ceil((at - offset) / HOUR_MS) * HOUR_MS + offset;
}

function labelEvery(span: number, narrow: boolean): number {
  return span > LONG_NIGHT_MS || (narrow && span >= SHORT_NIGHT_MS) ? 2 : 1;
}

function hourTicks(window: NightWindow, every: number): NightTick[] {
  const ticks: NightTick[] = [];
  for (let at = firstWholeHour(window.from); at < window.to; at += HOUR_MS) {
    const date = new Date(at);
    const labelled = date.getHours() % every === 0;
    ticks.push({
      at,
      kind: labelled ? 'labelled' : 'hour',
      label: labelled ? hourLabel(date) : null,
    });
  }
  return ticks;
}

function halfHourTicks(window: NightWindow): NightTick[] {
  const ticks: NightTick[] = [];
  for (let at = firstWholeHour(window.from) - HOUR_MS / 2; at < window.to; at += HOUR_MS) {
    if (at > window.from) {
      ticks.push({ at, kind: 'half', label: null });
    }
  }
  return ticks;
}

export function nightTicks(window: NightWindow, narrow: boolean): NightTick[] {
  const span = window.to - window.from;
  if (span <= 0) {
    return [];
  }
  const halves = span < SHORT_NIGHT_MS ? halfHourTicks(window) : [];
  return [...hourTicks(window, labelEvery(span, narrow)), ...halves]
    .filter((tick) => tick.at > window.from)
    .sort((left, right) => left.at - right.at);
}

export function labelFits(x: number, width: number): boolean {
  return x - TICK_LABEL_W / 2 >= 0 && x + TICK_LABEL_W / 2 <= width;
}
