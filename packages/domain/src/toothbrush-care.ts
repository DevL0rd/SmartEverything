import { SONICARE_HEAD_LIFETIME_SECONDS } from './toothbrush';

const DAY_MS = 86_400_000;

const CHARGE_RISE_PERCENT = 10;

export interface HeadUsagePoint {
  readonly at: string;
  readonly usageS: number;
}

export interface BatteryLevelPoint {
  readonly at: string;
  readonly percent: number;
}

export interface HeadForecast {
  readonly wearPercent: number;
  readonly sessionsLeft: number;
  readonly perDayS: number | null;
  readonly replaceBy: string | null;
}

export interface BatteryRun {
  readonly charges: readonly string[];
  readonly daysPerCharge: readonly number[];
  readonly daysLeft: number | null;
}

export function wearPercentOf(
  usageS: number,
  limitS: number = SONICARE_HEAD_LIFETIME_SECONDS,
): number {
  return Math.min(100, Math.round((usageS / limitS) * 100));
}

export function sessionsLeftOf(
  usageS: number,
  routineS: number,
  limitS: number = SONICARE_HEAD_LIFETIME_SECONDS,
): number {
  return Math.max(0, Math.floor((limitS - usageS) / routineS));
}

function ratePerDay(points: readonly HeadUsagePoint[]): number | null {
  const first = points.at(0);
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const days = (Date.parse(last.at) - Date.parse(first.at)) / DAY_MS;
  const used = last.usageS - first.usageS;
  return days >= 1 && used > 0 ? used / days : null;
}

export function headForecast(
  points: readonly HeadUsagePoint[],
  routineS: number,
  limitS: number = SONICARE_HEAD_LIFETIME_SECONDS,
): HeadForecast | null {
  const last = points.at(-1);
  if (last === undefined) {
    return null;
  }
  const perDayS = ratePerDay(points);
  const remaining = Math.max(0, limitS - last.usageS);
  const replaceBy =
    perDayS === null
      ? null
      : new Date(Date.parse(last.at) + (remaining / perDayS) * DAY_MS).toISOString();
  return {
    wearPercent: wearPercentOf(last.usageS, limitS),
    sessionsLeft: sessionsLeftOf(last.usageS, routineS, limitS),
    perDayS,
    replaceBy,
  };
}

export function batteryRun(points: readonly BatteryLevelPoint[]): BatteryRun {
  const charges: string[] = [];
  const spans: number[] = [];
  let runStart: BatteryLevelPoint | null = null;
  let previous: BatteryLevelPoint | null = null;
  for (const point of points) {
    if (previous !== null && point.percent - previous.percent >= CHARGE_RISE_PERCENT) {
      charges.push(point.at);
      if (runStart !== null) {
        spans.push((Date.parse(previous.at) - Date.parse(runStart.at)) / DAY_MS);
      }
      runStart = point;
    }
    runStart = runStart ?? point;
    previous = point;
  }
  return { charges, daysPerCharge: spans, daysLeft: daysLeftOf(runStart, previous, spans) };
}

function daysLeftOf(
  start: BatteryLevelPoint | null,
  latest: BatteryLevelPoint | null,
  spans: readonly number[],
): number | null {
  if (start === null || latest === null) {
    return null;
  }
  const days = (Date.parse(latest.at) - Date.parse(start.at)) / DAY_MS;
  const used = start.percent - latest.percent;
  if (days >= 1 && used > 0) {
    return Math.max(0, (latest.percent / used) * days);
  }
  const typical = spans.length === 0 ? null : spans.reduce((a, b) => a + b, 0) / spans.length;
  return typical === null ? null : Math.max(0, typical * (latest.percent / 100));
}
