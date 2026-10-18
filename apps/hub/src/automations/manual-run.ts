import { ApiError, type AutomationV2 } from '@smarteverything/domain';
import { commandRole } from '../server/commands';
import { currentControlCaller } from '../server/local-control-context';
import type { Store } from '../store/store';
import { reachesAi } from './ai-steps';

export function admitManualAutomation(
  store: Pick<Store, 'automations'>,
  definition: Pick<AutomationV2, 'steps'>,
): void {
  const caller = currentControlCaller();
  if (caller === undefined) {
    throw new ApiError('forbidden', 'Running an automation now requires an authenticated caller.');
  }
  if (commandRole(caller) !== 'owner' && reachesAi(store, definition)) {
    throw new ApiError(
      'forbidden',
      'Only an owner may run automations that wake the AI or use tools.',
    );
  }
}
