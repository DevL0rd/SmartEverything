import { zoneNamesOf } from '@smarteverything/domain';
import { clockText } from '../../toothbrush/model/brush-model';

export const QUARTER_COUNT = 4;

export const DEFAULT_QUARTER_S = 30;

export const TEETH_WIDTHS = [20, 19, 15, 14, 12, 10, 11] as const;

const QUARTER_NAMES = zoneNamesOf(4);

export type QuarterState = 'done' | 'current' | 'partial' | 'todo' | 'missed' | 'idle';

export interface Quarter {
  readonly index: number;
  readonly name: string;
  readonly seconds: number;
  readonly targetS: number;
  readonly fill: number;
  readonly state: QuarterState;
}

export interface ArchInput {
  readonly zoneSeconds: readonly number[];
  readonly targets: readonly number[];
  readonly current: number | null;
  readonly finished: boolean;
  readonly pacerOn: boolean;
}

export function targetsOf(
  pacer: readonly number[] | null,
  routineS: number | null,
): readonly number[] {
  const scheduled = (pacer ?? []).slice(0, QUARTER_COUNT);
  if (scheduled.length === QUARTER_COUNT && scheduled.every((seconds) => seconds > 0)) {
    return scheduled;
  }
  const each = routineS === null ? DEFAULT_QUARTER_S : routineS / QUARTER_COUNT;
  return Array.from({ length: QUARTER_COUNT }, () => each);
}

function stateOf(fill: number, index: number, input: ArchInput): QuarterState {
  if (!input.pacerOn) {
    return 'idle';
  }
  if (!input.finished && input.current === index) {
    return 'current';
  }
  if (fill >= 1) {
    return 'done';
  }
  if (fill > 0) {
    return 'partial';
  }
  if (input.finished) {
    return 'missed';
  }
  return input.current !== null && index < input.current ? 'missed' : 'todo';
}

export function quartersOf(input: ArchInput): readonly Quarter[] {
  return QUARTER_NAMES.map((name, position): Quarter => {
    const index = position + 1;
    const seconds = Math.max(0, input.zoneSeconds[position] ?? 0);
    const targetS = input.targets[position] ?? DEFAULT_QUARTER_S;
    const fill = targetS <= 0 ? 0 : Math.min(1, Math.round(seconds) / targetS);
    return { index, name, seconds, targetS, fill, state: stateOf(fill, index, input) };
  });
}

const TEETH_TOTAL = TEETH_WIDTHS.reduce((sum, width) => sum + width, 0);

export function toothFills(fill: number): readonly number[] {
  const lit = Math.min(1, Math.max(0, fill)) * TEETH_TOTAL;
  let start = 0;
  return TEETH_WIDTHS.map((width) => {
    const share = Math.min(1, Math.max(0, (lit - start) / width));
    start += width;
    return share;
  });
}

export function reachedCount(quarters: readonly Quarter[]): number {
  return quarters.filter((quarter) => quarter.state === 'done').length;
}

export function partialLabel(quarter: Quarter): string | null {
  return quarter.state === 'partial'
    ? `${clockText(quarter.seconds)} of ${clockText(quarter.targetS)}`
    : null;
}

export function archLabel(quarters: readonly Quarter[], finished: boolean): string {
  if (quarters.every((quarter) => quarter.state === 'idle')) {
    return 'Quarter timer, the pacer is off on this handle';
  }
  const parts = quarters.map((quarter) => {
    switch (quarter.state) {
      case 'done':
        return `${quarter.name} done`;
      case 'current':
        return `${quarter.name} now, ${clockText(quarter.seconds)} of ${clockText(quarter.targetS)}`;
      case 'partial':
        return `${quarter.name} partly, ${clockText(quarter.seconds)} of ${clockText(quarter.targetS)}`;
      case 'missed':
        return `${quarter.name} not reached`;
      case 'todo':
      case 'idle':
        return `${quarter.name} to do`;
    }
  });
  const head = finished ? `${String(reachedCount(quarters))} of 4 quarters` : 'Quarter timer';
  return `${head}. ${parts.join(', ')}`;
}

export const ARCH_CAPTION =
  'Quarters are timed by the handle’s pacer. The brush does not report where in the mouth it is.';

export const ARCH_CAPTION_PACER_OFF = 'The pacer is off on this handle, so there are no quarters.';

export interface CentreInput {
  readonly elapsedS: number;
  readonly routineS: number | null;
  readonly current: number | null;
  readonly finished: boolean;
  readonly quarters: readonly Quarter[];
}

export function centreLines(input: CentreInput): { readonly big: string; readonly small: string } {
  const big = clockText(input.elapsedS);
  if (input.finished) {
    return { big, small: `${String(reachedCount(input.quarters))} of 4 quarters` };
  }
  const of = input.routineS === null ? '' : `of ${clockText(input.routineS)}`;
  const quarter = input.current === null ? '' : `quarter ${String(input.current)} of 4`;
  return { big, small: [of, quarter].filter((part) => part !== '').join(' · ') };
}
