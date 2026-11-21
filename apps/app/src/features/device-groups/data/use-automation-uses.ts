import type { DeviceTarget } from '@smarteverything/domain';
import { useStoreSelector } from '../../../store/store-context';
import { rowsOf } from '../../../store/state';
import { useAutomationsSource } from '../../automations';
import {
  automationsUsing,
  referenceIdOf,
  sameUses,
  type AutomationUse,
} from '../model/automation-uses';

const NONE: readonly AutomationUse[] = [];

export function useAutomationUses(target: DeviceTarget): readonly AutomationUse[] {
  const { lookup } = useAutomationsSource();
  const referenceId = referenceIdOf(target);
  return useStoreSelector(
    (state) =>
      referenceId === null
        ? NONE
        : automationsUsing(rowsOf(state.tables.automations), referenceId, lookup),
    sameUses,
    [referenceId, lookup],
  );
}
