import {
  ORALB_MODE_LABELS,
  type BrushView,
  type OralbMode,
  type OralbRingValue,
} from '@smarteverything/domain';
import { clockText } from '../../toothbrush/model/brush-model';
import { daysLeftRatio } from '../../toothbrush/model/care-model';

type HeadView = Extract<BrushView, { readonly view: 'head' }>;
export type OralbHandle = NonNullable<
  Extract<BrushView, { readonly view: 'handle' }>['handle']['oralb']
>;

export type CountdownTone = 'positive' | 'warning' | 'critical';

export interface Countdown {
  readonly share: number;
  readonly tone: CountdownTone;
  readonly big: string;
  readonly small: string | null;
  readonly days: number;
}

export const DEFAULT_BASELINE_DAYS = 90;

export function toneOfDays(days: number, warnDays: number, dueDays: number): CountdownTone {
  if (days <= dueDays) {
    return 'critical';
  }
  return days <= warnDays ? 'warning' : 'positive';
}

export function dayWord(days: number): string {
  return days === 1 ? '1 day' : `${String(days)} days`;
}

export function countdownOf(
  head: HeadView['head'],
  limits: { readonly warnDays: number; readonly dueDays: number },
): Countdown | null {
  const days = head.daysLeft;
  if (days === null) {
    return null;
  }
  const sessions = head.sessionsLeft;
  return {
    share: daysLeftRatio(head) ?? Math.min(1, days / DEFAULT_BASELINE_DAYS),
    tone: toneOfDays(days, limits.warnDays, limits.dueDays),
    big: days === 0 ? 'Due now' : dayWord(days),
    small:
      sessions === null || sessions === 0
        ? null
        : `about ${String(sessions)} ${sessions === 1 ? 'session' : 'sessions'} left`,
    days,
  };
}

export function countdownLabel(countdown: Countdown | null): string {
  if (countdown === null) {
    return 'Brush head countdown not read yet';
  }
  const left = countdown.small === null ? '' : `, ${countdown.small}`;
  return `Brush head: ${countdown.days === 0 ? 'due now' : `${dayWord(countdown.days)} left`}${left}`;
}

export type ReminderState = HeadView['head']['reminder'];

const REMINDER_WORD: Readonly<Record<NonNullable<ReminderState>, string>> = {
  on: 'Reminder on',
  reset: 'Reminder reset',
  snooze: 'Reminder snoozed',
  interval: 'Reminder on',
  off: 'Reminder off',
};

export function reminderWord(state: ReminderState): string | null {
  return state === null ? null : REMINDER_WORD[state];
}

export function reminderTone(state: ReminderState): 'neutral' | 'positive' | 'warning' {
  if (state === 'off') {
    return 'neutral';
  }
  return state === 'snooze' ? 'warning' : 'positive';
}

export function countedFrom(resetSeen: boolean): string {
  return resetSeen
    ? 'Counted from the last time the reminder was reset on the handle.'
    : 'Counted from the first reading.';
}

export interface DaysPoint {
  readonly at: number;
  readonly days: number;
}

export interface DaysSeries {
  readonly points: readonly DaysPoint[];
  readonly resets: readonly number[];
  readonly fromMs: number;
  readonly toMs: number;
}

export type TimelineSpan = Pick<
  HeadView['timeline'][number],
  'firstSeen' | 'lastSeen' | 'usageS' | 'limitS'
>;

const SIX_MONTHS_MS = 183 * 86_400_000;

export function daysSeriesOf(timeline: readonly TimelineSpan[], nowMs: number): DaysSeries | null {
  const start = nowMs - SIX_MONTHS_MS;
  const points: DaysPoint[] = [];
  const resets: number[] = [];
  timeline.forEach((row, index) => {
    const first = Date.parse(row.firstSeen);
    const last = Date.parse(row.lastSeen);
    const begins = row.limitS / 86_400;
    const ends = Math.max(0, begins - row.usageS / 86_400);
    if (last < start) {
      return;
    }
    if (index > 0 && first >= start) {
      resets.push(first);
    }
    points.push({ at: Math.max(first, start), days: begins }, { at: last, days: ends });
  });
  return points.length < 2 ? null : { points, resets, fromMs: start, toMs: nowMs };
}

export function daysSeriesLabel(series: DaysSeries | null): string {
  if (series === null) {
    return 'Days left on the brush head over six months. Not enough readings yet.';
  }
  const heads = series.resets.length + 1;
  return `Days left on the brush head over six months, ${String(heads)} ${heads === 1 ? 'head' : 'heads'}`;
}

export function batterySessionsLine(
  runtimeS: number | null,
  routineS: number | null,
): string | null {
  if (runtimeS === null || runtimeS <= 0 || routineS === null || routineS <= 0) {
    return null;
  }
  const sessions = Math.floor(runtimeS / routineS);
  return sessions <= 0
    ? null
    : `About ${String(sessions)} brushing ${sessions === 1 ? 'session' : 'sessions'} left on this charge`;
}

export const RING_NAME: Readonly<Record<OralbRingValue, string>> = {
  white: 'White',
  yellow: 'Yellow',
  orange: 'Orange',
  blue: 'Blue',
  turquoise: 'Turquoise',
  pink: 'Pink',
  custom: 'Custom colour',
};

export function ringHex(display: readonly number[] | null): string | null {
  if (display?.length !== 3) {
    return null;
  }
  return `#${display.map((level) => level.toString(16).padStart(2, '0')).join('')}`;
}

export function ringText(handle: Pick<OralbHandle, 'ringColour'>): string {
  return handle.ringColour === null ? 'Ring colour not read yet' : RING_NAME[handle.ringColour];
}

export function seriesChip(handle: Pick<OralbHandle, 'firmware'>): string {
  return `iO Series · firmware ${String(handle.firmware)}`;
}

export interface SlotView {
  readonly mode: OralbMode;
  readonly label: string;
  readonly current: boolean;
}

export function slotsOf(
  slots: readonly OralbMode[],
  current: OralbMode | null,
): readonly SlotView[] {
  return slots.map((mode) => ({ mode, label: ORALB_MODE_LABELS[mode], current: mode === current }));
}

export interface PacerBar {
  readonly segments: readonly number[];
  readonly totalS: number;
  readonly label: string;
}

export function pacerBarOf(pacer: readonly number[] | null): PacerBar {
  const segments = (pacer ?? []).filter((seconds) => seconds > 0);
  const totalS = segments.reduce((sum, seconds) => sum + seconds, 0);
  return {
    segments,
    totalS,
    label: totalS === 0 ? 'Pacer off' : `${clockText(totalS)} target`,
  };
}

export interface Counter {
  readonly label: string;
  readonly digits: readonly string[];
  readonly unit: string;
}

export function counterDigits(value: number, places: number): readonly string[] {
  return Math.round(value).toString().padStart(places, '0').split('');
}

export function countersOf(handle: OralbHandle): readonly Counter[] {
  const found: Counter[] = [];
  if (handle.chargeCycles !== null) {
    found.push({ label: 'Charge cycles', digits: counterDigits(handle.chargeCycles, 4), unit: '' });
  }
  if (handle.brushingCycles !== null) {
    found.push({
      label: 'Brushing cycles',
      digits: counterDigits(handle.brushingCycles, 4),
      unit: '',
    });
  }
  if (handle.motorSeconds !== null) {
    found.push({
      label: 'Motor runtime',
      digits: counterDigits(handle.motorSeconds / 3600, 4),
      unit: 'hours',
    });
  }
  return found;
}

export const COUNTERS_LOCKED = 'Read after the handle test passes';
