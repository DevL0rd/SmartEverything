import type { TableRow } from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { memoOnInputs } from '../../../../store/memo-selector';
import { rowsOf, type StoreState } from '../../../../store/state';

export interface ByHand {
  readonly id: string;
  readonly name: string;
}

export function byHandOf(automations: readonly TableRow<'automations'>[]): readonly ByHand[] {
  return automations
    .filter(
      (automation) =>
        automation.enabled &&
        automation.definition.triggers.some(
          (trigger) => trigger.enabled !== false && trigger.kind === 'trigger.called',
        ),
    )
    .map((automation) => ({ id: automation.id, name: automation.name }))
    .sort((left, right) => compareText(left.name, right.name));
}

export const selectByHand = memoOnInputs(
  (state: StoreState) => [state.tables.automations],
  (state) => byHandOf(rowsOf(state.tables.automations)),
);

export function sameByHand(left: readonly ByHand[], right: readonly ByHand[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return other?.id === entry.id && other.name === entry.name;
    })
  );
}
