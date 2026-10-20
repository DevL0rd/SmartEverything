import { NODE_REGISTRY, type DeviceTarget, type ReferenceContext } from '@smarteverything/domain';
import {
  automationRowsOf,
  automationsUsing as automationsUsingRows,
  type AutomationUse,
} from '../../automations';

export type { AutomationUse };

const CONTEXT: ReferenceContext = { kinds: NODE_REGISTRY.get, functions: () => undefined };

export function automationsUsing(
  rows: readonly unknown[],
  referenceId: string,
): readonly AutomationUse[] {
  return automationsUsingRows(automationRowsOf(rows).rows, referenceId, CONTEXT);
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
