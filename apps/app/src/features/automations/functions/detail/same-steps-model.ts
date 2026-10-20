import type { AutomationFunctionDetail, AutomationRowV3 } from '@smarteverything/domain';
import { findSameSteps } from '@smarteverything/flow/functions/same-steps';
import { placesText } from '../library/library-model';

export type SameStepsSource = Pick<AutomationRowV3, 'id' | 'name' | 'definition'>;

export interface SameStepsRow {
  readonly id: string;
  readonly name: string;
  readonly places: number;
  readonly text: string;
}

export function sameStepsRows(
  detail: AutomationFunctionDetail,
  automations: readonly SameStepsSource[],
): readonly SameStepsRow[] {
  const using = new Set(
    detail.usedBy.filter((user) => user.kind === 'automation').map((user) => user.id),
  );
  const candidates = automations
    .filter((automation) => !using.has(automation.id))
    .map((automation) => ({
      id: automation.id,
      name: automation.name,
      program: automation.definition,
    }));
  const counts = new Map<string, number>();
  for (const match of findSameSteps(detail.program, candidates)) {
    counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
  }
  return candidates.flatMap(({ id, name }) => {
    const places = counts.get(id);
    return places === undefined
      ? []
      : [{ id, name, places, text: `Same steps in ${placesText(places)}` }];
  });
}

export function sameStepsSummary(rows: readonly SameStepsRow[]): string {
  if (rows.length === 0) return 'None of your other automations repeat these steps.';
  const count = String(rows.length);
  return rows.length === 1
    ? '1 automation repeats these steps. Open it to use this node there.'
    : `${count} automations repeat these steps. Open one to use this node there.`;
}
