import type { HypnogramStage } from '../../../components/charts/hypnogram-model';
import {
  MINUTE_MS,
  clock,
  hoursMinutes,
  shortDate,
  startOfDayKey,
  weekdayShort,
} from '../../../format/time';
import { STAGE_LABELS, type SleepNight } from './sleep';
import { trimWholeHours, type StageRow } from './sleep-summary';

const VITALS_PAD_MS = 15 * MINUTE_MS;
const STRIP_MAX_PERCENT = 60;

export interface VitalsWindow {
  readonly from: number;
  readonly to: number;
}

export function vitalsQueryWindowOf(night: SleepNight): VitalsWindow {
  return { from: night.bedtime - VITALS_PAD_MS, to: night.wake + VITALS_PAD_MS };
}

export function goalPercentOf(asleepMinutes: number, goalMinutes: number): number {
  if (goalMinutes <= 0) {
    return 0;
  }
  return Math.min(100, Math.floor((asleepMinutes / goalMinutes) * 100));
}

export function nightDateLabel(night: SleepNight): string {
  return `${weekdayShort(night.wake)}, ${shortDate(night.wake)}`;
}

export interface InBedParts {
  readonly times: string;
  readonly duration: string;
}

export function inBedParts(night: SleepNight): InBedParts {
  return {
    times: `${clock(night.bedtime)} – ${clock(night.wake)}`,
    duration: `${hoursMinutes(night.inBedMinutes)} in bed`,
  };
}

export function inBedLine(night: SleepNight): string {
  const { times, duration } = inBedParts(night);
  return `${times} · ${duration}`;
}

export function goalLine(goalMinutes: number, percent: number): string {
  return `Goal ${trimWholeHours(hoursMinutes(goalMinutes))} · ${String(percent)}%`;
}

export function napChipLabel(nap: SleepNight): string {
  return `Nap ${clock(nap.bedtime)} · ${hoursMinutes(nap.asleepMinutes)}`;
}

export function napTitle(nap: SleepNight): string {
  return `Nap · ${hoursMinutes(nap.asleepMinutes)} asleep`;
}

export interface NapPiece {
  readonly stage: HypnogramStage;
  readonly share: number;
}

export function napPiecesOf(nap: SleepNight): readonly NapPiece[] {
  if (!nap.hasStages) {
    return [{ stage: 'asleep', share: 1 }];
  }
  const span = nap.stages.reduce((sum, stage) => sum + (stage.end - stage.start), 0);
  return nap.stages.map((stage) => ({
    stage: stage.kind === 'unknown' ? 'light' : stage.kind,
    share: span > 0 ? (stage.end - stage.start) / span : 0,
  }));
}

export interface NapLegendEntry {
  readonly stage: HypnogramStage;
  readonly text: string;
}

const NAP_LEGEND_ORDER = ['awake', 'rem', 'light', 'deep'] as const;

export function napLegendOf(nap: SleepNight): readonly NapLegendEntry[] {
  if (!nap.hasStages) {
    return [];
  }
  return NAP_LEGEND_ORDER.filter((stage) => nap.totals[stage] > 0).map((stage) => ({
    stage,
    text: `${STAGE_LABELS[stage]} ${hoursMinutes(nap.totals[stage])}`,
  }));
}

export function napOnlyLine(day: string): string {
  return `No night recorded for ${shortDate(startOfDayKey(day))}.`;
}

export interface EmptyCopy {
  readonly title: string;
  readonly body: string;
}

export function emptyCopyOf(lastDay: string | null): EmptyCopy {
  const first = 'Wear your watch to bed and sync in the morning.';
  return {
    title: 'No sleep recorded',
    body:
      lastDay === null
        ? first
        : `${first} Last night with data: ${shortDate(startOfDayKey(lastDay))}.`,
  };
}

export interface StageSlice {
  readonly stage: StageRow['stage'];
  readonly share: number;
}

export function stackOf(rows: readonly StageRow[]): readonly StageSlice[] {
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  return rows
    .filter((row) => row.minutes > 0)
    .map((row) => ({ stage: row.stage, share: total > 0 ? row.minutes / total : 0 }));
}

export interface RangeStrip {
  readonly bandLeft: number;
  readonly bandWidth: number;
  readonly dot: number;
}

export function stripOf(row: StageRow): RangeStrip {
  const along = (percent: number): number => Math.min(1, Math.max(0, percent / STRIP_MAX_PERCENT));
  const left = along(row.typical.low);
  return {
    bandLeft: left,
    bandWidth: along(row.typical.high) - left,
    dot: along(row.percent),
  };
}

export function rowLine(row: StageRow): string {
  return `${row.label} · ${hoursMinutes(row.minutes)} · ${String(row.percent)}%`;
}

export function stageSummaryLabel(rows: readonly StageRow[]): string {
  return rows
    .map(
      (row) =>
        `${row.label} ${hoursMinutes(row.minutes)}, ${String(row.percent)}%, ${row.typical.caption.toLowerCase()}`,
    )
    .join('. ');
}
