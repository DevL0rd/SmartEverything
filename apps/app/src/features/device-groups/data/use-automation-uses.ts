import { useMemo } from 'react';
import type { DeviceTarget } from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';
import { storedAutomationOf } from '../../automations';
import { automationsUsing, referenceIdOf, type AutomationUse } from '../model/automation-uses';

const NONE: readonly AutomationUse[] = [];

export function useAutomationUses(target: DeviceTarget): readonly AutomationUse[] {
  const rows = useRows('automations');
  const referenceId = referenceIdOf(target);
  return useMemo(
    () => (referenceId === null ? NONE : automationsUsing(rows, referenceId, storedAutomationOf)),
    [rows, referenceId],
  );
}
