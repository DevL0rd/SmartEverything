import type { AssistantMessageRow } from '@smarteverything/domain';

export const NO_COST_REPORTED = 'No cost reported';

export function noCostReported(
  row: Pick<AssistantMessageRow, 'model' | 'cost_micros' | 'cost_incomplete'>,
): boolean {
  return row.model !== null && row.cost_micros === 0 && row.cost_incomplete !== true;
}
