import {
  type DeviceTarget,
  type NodeKindLookup,
  type ReferenceContext,
} from '@smarteverything/domain';
import {
  automationRowsOf,
  automationsUsing as automationsUsingRows,
  type AutomationUse,
} from '../../automations';

export type { AutomationUse };

export function automationsUsing(
  rows: readonly unknown[],
  referenceId: string,
  kinds: NodeKindLookup,
): readonly AutomationUse[] {
  const context: ReferenceContext = { kinds: (id) => kinds.get(id), functions: () => undefined };
  return automationsUsingRows(automationRowsOf(rows, kinds).rows, referenceId, context);
}

export function referenceIdOf(target: DeviceTarget): string | null {
  switch (target.kind) {
    case 'group':
      return target.groupId;
    case 'room':
      return target.roomId;
    case 'devices':
      return null;
  }
}
