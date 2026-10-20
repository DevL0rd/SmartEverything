import { hoursMinutes } from '../../format/time';
import type { HypnogramStage } from './hypnogram-model';
import {
  NO_DATA,
  columnName,
  recordedText,
  type BarsSpan,
  type ColumnReadout,
  type ReadoutRow,
} from './night-bars-model';

export const STAGE_GAP_PX = 2;

const MIX_STEP = 120;
const MIX_STEP_TALL = 240;
const MIX_TALL_FROM = 12 * 60;
const MIX_HEADROOM = 20;

export interface MixStages {
  readonly deep: number;
  readonly light: number;
  readonly rem: number;
}

export interface MixNight {
  readonly asleep: number;
  readonly stages: MixStages | null;
}

export interface MixColumn {
  readonly key: string;
  readonly at: number;
  readonly night: MixNight | null;
}

export const MIX_STAGES = ['deep', 'light', 'rem'] as const;

export type MixStage = (typeof MIX_STAGES)[number];

function stageName(stage: MixStage): string {
  return { deep: 'Deep', light: 'Light', rem: 'REM' }[stage];
}

export function mixTotal(night: MixNight): number {
  return night.stages === null
    ? night.asleep
    : night.stages.deep + night.stages.light + night.stages.rem;
}

export interface MixDomain {
  readonly top: number;
  readonly ticks: readonly number[];
}

export function mixDomain(columns: readonly MixColumn[], references: readonly number[]): MixDomain {
  const peak = Math.max(
    0,
    ...references,
    ...columns.map((column) => (column.night === null ? 0 : mixTotal(column.night))),
  );
  const step = peak + MIX_HEADROOM > MIX_TALL_FROM ? MIX_STEP_TALL : MIX_STEP;
  const top = Math.ceil((peak + MIX_HEADROOM) / step) * step;
  const ticks: number[] = [];
  for (let minute = 0; minute <= top; minute += step) {
    ticks.push(minute);
  }
  return { top, ticks };
}

export function mixShare(domain: MixDomain, minutes: number): number {
  return Math.min(1, Math.max(0, minutes / domain.top));
}

export interface StackSegment {
  readonly stage: HypnogramStage;
  readonly top: number;
  readonly bottom: number;
  readonly capped: boolean;
}

function segmentsOf(night: MixNight): { stage: HypnogramStage; minutes: number }[] {
  if (night.stages === null) {
    return [{ stage: 'asleep', minutes: night.asleep }];
  }
  const { stages } = night;
  return MIX_STAGES.map((stage) => ({ stage, minutes: stages[stage] })).filter(
    (entry) => entry.minutes > 0,
  );
}

export function stackOf(
  night: MixNight,
  domain: MixDomain,
  plotHeight: number,
): readonly StackSegment[] {
  const entries = segmentsOf(night);
  let used = 0;
  return entries.map((entry, index) => {
    const bottom = plotHeight - mixShare(domain, used) * plotHeight;
    used += entry.minutes;
    const top = plotHeight - mixShare(domain, used) * plotHeight;
    const last = index === entries.length - 1;
    return {
      stage: entry.stage,
      top,
      bottom: index === 0 ? bottom : bottom - STAGE_GAP_PX,
      capped: last,
    };
  });
}

export function mixReadout(span: BarsSpan, column: MixColumn): ColumnReadout {
  const name = columnName(span, column.at);
  const { night } = column;
  if (night === null) {
    return { heading: name, rows: [NO_DATA], text: `${name} · No data` };
  }
  const total = hoursMinutes(mixTotal(night));
  const heading = `${name} · ${total}`;
  if (night.stages === null) {
    return {
      heading,
      rows: [{ label: 'Asleep', value: total, stage: 'asleep' }],
      text: `${name} · ${total} asleep · Stages not recorded`,
    };
  }
  const { stages } = night;
  const rows = MIX_STAGES.map((stage): ReadoutRow => ({
    label: stageName(stage),
    value: hoursMinutes(stages[stage]),
    stage,
  }));
  const parts = rows.map((row) => `${row.label} ${row.value}`).join(', ');
  return { heading, rows, text: `${name} · ${total} asleep · ${parts}` };
}

export interface LineSides {
  readonly first: 'above' | 'below';
  readonly second: 'above' | 'below';
}

export function lineSides(firstY: number, secondY: number): LineSides {
  return firstY <= secondY
    ? { first: 'above', second: 'below' }
    : { first: 'below', second: 'above' };
}

export function hasUnstaged(columns: readonly MixColumn[]): boolean {
  return columns.some((column) => column.night !== null && column.night.stages === null);
}

export function mixSummary(
  label: string,
  span: BarsSpan,
  columns: readonly MixColumn[],
  reference: { readonly goal: number; readonly average: number | null },
): string {
  const recorded = columns.filter((column) => column.night !== null).length;
  const average = reference.average === null ? '' : ` Average ${hoursMinutes(reference.average)}.`;
  return `${label}, ${recordedText(recorded, columns.length, span)}.${average} Goal ${hoursMinutes(reference.goal)}.`;
}

export function goalText(minutes: number): string {
  return minutes % 60 === 0 ? `${String(minutes / 60)}h` : hoursMinutes(minutes);
}

export function tickText(minutes: number): string {
  return `${String(minutes / 60)}h`;
}
