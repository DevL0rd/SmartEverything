import { useMemo, useSyncExternalStore } from 'react';
import { listOf, type AutomationList } from './automation-rows';
import { useAutomationsSource } from './source';

export function useAutomations(): AutomationList {
  const { automations } = useAutomationsSource();
  const snapshot = useSyncExternalStore(
    automations.subscribe,
    automations.snapshot,
    automations.snapshot,
  );
  return useMemo(() => listOf(snapshot), [snapshot]);
}
