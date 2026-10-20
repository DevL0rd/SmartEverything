import type { BrushView } from '@smarteverything/domain';

type HeadView = Extract<BrushView, { readonly view: 'head' }>;
type BatteryView = Extract<BrushView, { readonly view: 'battery' }>;
type HandleView = Extract<BrushView, { readonly view: 'handle' }>;

export type WearTone = 'fresh' | 'worn' | 'due';

export function wearTone(percent: number, warn: number, due: number): WearTone {
  if (percent >= due) {
    return 'due';
  }
  return percent >= warn ? 'worn' : 'fresh';
}

export function headLine(head: HeadView['head']): string {
  switch (head.state) {
    case 'missing':
      return 'No brush head on the handle';
    case 'unrecognised':
      return 'This brush head was not recognised. It may not be a genuine head.';
    case 'fitted':
      return fittedLine(head);
  }
}

function fittedLine(head: HeadView['head']): string {
  if (head.daysLeft !== null) {
    return head.daysLeft === 0
      ? 'The brush head is due for replacing'
      : `${String(head.daysLeft)} ${head.daysLeft === 1 ? 'day' : 'days'} left until the brush head is due`;
  }
  return head.wearPercent === null
    ? 'Brush head fitted'
    : `${String(head.wearPercent)} percent worn, about ${String(head.sessionsLeft ?? 0)} brushes left`;
}

export function daysLeftRatio(head: HeadView['head']): number | null {
  if (head.daysLeft === null || head.baselineDays === null || head.baselineDays === 0) {
    return null;
  }
  return Math.min(1, Math.max(0, head.daysLeft / head.baselineDays));
}

export function replaceByText(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface ForecastLine {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly warnY: number;
}

export function forecastLine(
  head: HeadView['head'],
  perDayS: number | null,
  warn: number,
): ForecastLine | null {
  if (
    head.wearPercent === null ||
    perDayS === null ||
    head.limitS === null ||
    head.usageS === null
  ) {
    return null;
  }
  const days = Math.max(1, (head.limitS - head.usageS) / perDayS);
  return {
    from: { x: 0, y: head.wearPercent / 100 },
    to: { x: days, y: 1 },
    warnY: warn / 100,
  };
}

export interface TimelineBar {
  readonly serial: string;
  readonly share: number;
  readonly current: boolean;
  readonly label: string;
}

export function timelineBars(rows: HeadView['timeline']): readonly TimelineBar[] {
  return rows.map((row) => ({
    serial: row.serial,
    share: Math.min(1, row.usageS / row.limitS),
    current: row.current,
    label: `${row.firstSeen.slice(0, 10)} to ${row.lastSeen.slice(0, 10)}, ${String(Math.round((row.usageS / row.limitS) * 100))} percent used`,
  }));
}

export interface BatteryPlot {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly charges: readonly number[];
  readonly low: number;
}

export function batteryPlot(view: BatteryView, low: number): BatteryPlot | null {
  const first = view.levels[0];
  const last = view.levels.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const start = Date.parse(first.at);
  const span = Math.max(1, Date.parse(last.at) - start);
  const at = (iso: string): number => (Date.parse(iso) - start) / span;
  return {
    points: view.levels.map((point) => ({ x: at(point.at), y: point.value / 100 })),
    charges: view.charges.map(at),
    low: low / 100,
  };
}

export function daysLeftText(days: number | null): string | null {
  if (days === null) {
    return null;
  }
  const whole = Math.round(days);
  return days < 1
    ? 'Less than a day left'
    : `About ${String(whole)} ${whole === 1 ? 'day' : 'days'} left`;
}

export function scatterPoints(
  view: BatteryView,
): readonly { readonly x: number; readonly y: number }[] {
  const volts = view.millivolts;
  if (volts.length === 0) {
    return [];
  }
  const low = Math.min(...volts.map((point) => point.millivolts));
  const high = Math.max(...volts.map((point) => point.millivolts));
  const span = Math.max(1, high - low);
  return volts.map((point) => ({ x: point.percent / 100, y: (point.millivolts - low) / span }));
}

export function weekBars(
  view: HandleView,
): readonly { readonly label: string; readonly value: number }[] {
  return view.sessionsByWeek
    .slice(-12)
    .map((week) => ({ label: week.weekStart.slice(5), value: week.sessions }));
}

export function odometer(hours: number | null): readonly string[] {
  return hours === null ? [] : Math.round(hours).toString().padStart(5, '0').split('');
}

export function handleFault(handle: HandleView['handle']): string {
  return handle.faultHex === null ? 'No fault' : `Error bits ${handle.faultHex}`;
}

export const PLOT_PAD = 6;
export const PLOT_HEIGHT = 112;

export function batteryPath(plot: BatteryPlot, width: number): string {
  return plot.points
    .map((point, index) => {
      const x = PLOT_PAD + point.x * (width - 2 * PLOT_PAD);
      const y = PLOT_HEIGHT - PLOT_PAD - point.y * (PLOT_HEIGHT - 2 * PLOT_PAD);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
