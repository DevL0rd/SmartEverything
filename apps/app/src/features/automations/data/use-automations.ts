import { usePausable } from '../../../design/external-store';
import { listOf, type AutomationList } from './automation-rows';
import type { AutomationRow } from './graph-adapter';
import { useAutomationsSource } from './source';

export function useAutomations(): AutomationList {
  const { automations } = useAutomationsSource();
  return listOf(usePausable(automations.subscribe, automations.snapshot));
}

export function useAutomationName(automationId: string | null): string | null {
  const { automations } = useAutomationsSource();
  return usePausable(automations.subscribe, () =>
    automationId === null
      ? null
      : (listOf(automations.snapshot()).byId.get(automationId)?.name ?? null),
  );
}

export function useAutomationRow(automationId: string | null): AutomationRow | null {
  const { automations } = useAutomationsSource();
  return usePausable(automations.subscribe, () =>
    automationId === null
      ? null
      : (automations.snapshot().rows.find((row) => row.id === automationId) ?? null),
  );
}
