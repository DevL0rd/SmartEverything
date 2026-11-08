import type { AssistantMessageRow } from '@smarteverything/domain';
import { decimal } from '../../../format/number';
import { compareText } from '../../../format/text';
import { duration } from '../../../format/time';

export const NO_COST_REPORTED = 'Cost not reported';

export type CostFields = Pick<AssistantMessageRow, 'model' | 'cost_micros' | 'cost_incomplete'>;

export type ReplyCost =
  | { readonly kind: 'unreported' }
  | {
      readonly kind: 'known' | 'partial';
      readonly micros: number;
      readonly share: number | null;
      readonly top: boolean;
    };

export interface CostBar {
  readonly key: string;
  readonly value: number;
}

export function noCostReported(row: CostFields): boolean {
  return row.model !== null && row.cost_micros === 0 && row.cost_incomplete !== true;
}

export function costPeakOf(rows: readonly Pick<AssistantMessageRow, 'cost_micros'>[]): number {
  return rows.reduce((peak, row) => Math.max(peak, row.cost_micros), 0);
}

export function replyCostOf(row: CostFields, peak: number | null): ReplyCost | null {
  const micros = row.cost_micros;
  if (noCostReported(row) || (row.cost_incomplete === true && micros === 0))
    return { kind: 'unreported' };
  if (micros === 0) return null;
  const scaled = peak !== null && peak > 0;
  return {
    kind: row.cost_incomplete === true ? 'partial' : 'known',
    micros,
    share: scaled ? Math.min(1, micros / peak) : null,
    top: scaled && micros >= peak,
  };
}

export function costBarsOf(
  rows: readonly Pick<AssistantMessageRow, 'id' | 'role' | 'cost_micros' | 'created_at'>[],
): readonly CostBar[] {
  return rows
    .filter((row) => row.role === 'responder' && row.cost_micros > 0)
    .sort((left, right) => compareText(left.created_at, right.created_at))
    .map((row) => ({ key: row.id, value: row.cost_micros }));
}

export function turnTime(durationMs: number): string {
  const seconds = durationMs / 1000;
  if (seconds < 10) return `${decimal(seconds, 1)} s`;
  return duration(seconds);
}
