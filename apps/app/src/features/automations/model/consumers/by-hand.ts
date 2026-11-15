import type { TableRow } from '@smarteverything/domain';
import { compareText } from '../../../../format/text';

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
