import { clock, hoursMinutes } from '../../../format/time';
import {
  goalLine,
  goalPercentOf,
  napLegendOf,
  napPiecesOf,
  type NapLegendEntry,
  type NapPiece,
} from './night-card';
import type { SleepNight } from './sleep';
import { stageRowsOf, type SummaryStage } from './sleep-summary';

export const NO_STAGES_NOTE = 'Stages not recorded · Based on duration only';

export interface LegendRow {
  readonly stage: SummaryStage;
  readonly label: string;
  readonly minutes: string;
  readonly percent: string;
}

export function legendRowsOf(night: SleepNight): readonly LegendRow[] {
  return stageRowsOf(night).map((row) => ({
    stage: row.stage,
    label: row.label,
    minutes: hoursMinutes(row.minutes),
    percent: `${String(row.percent)}%`,
  }));
}

export interface GoalFigures {
  readonly progress: number;
  readonly short: string;
  readonly long: string;
}

export function goalFiguresOf(night: SleepNight, goalMinutes: number): GoalFigures {
  const percent = goalPercentOf(night.asleepMinutes, goalMinutes);
  return {
    progress: percent / 100,
    short: `${String(percent)}%`,
    long: goalLine(goalMinutes, percent),
  };
}

export function timesLineOf(night: SleepNight): string {
  return `${clock(night.bedtime)} – ${clock(night.wake)}`;
}

export interface NapFace {
  readonly headline: string;
  readonly times: string;
  readonly start: string;
  readonly end: string;
  readonly pieces: readonly NapPiece[];
  readonly legend: readonly NapLegendEntry[];
}

export function napFaceOf(naps: readonly SleepNight[]): NapFace | null {
  const nap = [...naps].sort((left, right) => right.asleepMinutes - left.asleepMinutes)[0];
  if (nap === undefined) {
    return null;
  }
  return {
    headline: `Nap · ${hoursMinutes(nap.asleepMinutes)}`,
    times: timesLineOf(nap),
    start: clock(nap.bedtime),
    end: clock(nap.wake),
    pieces: napPiecesOf(nap),
    legend: napLegendOf(nap),
  };
}
