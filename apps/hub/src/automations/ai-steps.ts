import {
  AUTOMATION_V2,
  automationUsesAi,
  walkSteps,
  type AutomationV2,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export function reachesAi(
  store: Pick<Store, 'automations'>,
  definition: Pick<AutomationV2, 'steps'>,
  seen = new Set<string>(),
): boolean {
  if (automationUsesAi(definition.steps)) return true;
  return walkSteps(definition.steps).some((step) => {
    if (step.do !== 'run' || seen.has(step.automation)) return false;
    seen.add(step.automation);
    const row = store.automations.find(step.automation);
    const callee = row === undefined ? undefined : AUTOMATION_V2.safeParse(row.definition);
    return callee?.success === true && reachesAi(store, callee.data, seen);
  });
}
