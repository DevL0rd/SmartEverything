import { automationProgram, programActions } from './program';
import { AI_ACTION_TYPES, ApiError, type AutomationDefinition } from '@smarteverything/domain';
import { validateExecutionAuthority } from '../assistant/execution-authority';
import { profileIdOf, type Caller } from '../server/auth';
import { commandPrincipal } from '../server/commands';
import { currentControlCaller } from '../server/local-control-context';
import type { Store } from '../store/store';

function currentCaller(store: Store, caller: Caller, profileId: string): Caller {
  store.profiles.byId(profileId);
  if (caller.kind !== 'client') {
    return caller;
  }
  const client = store.clients.byId(caller.client.id);
  if (store.profiles.activeOf(client.id).id !== profileId) {
    throw new ApiError('forbidden', 'The initiating app changed its active profile.');
  }
  if (caller.authority !== undefined) {
    validateExecutionAuthority(store, caller.authority);
    if (caller.authority.profile_id !== profileId) {
      throw new ApiError('forbidden', 'The automation changed its initiating execution profile.');
    }
  }
  return { ...caller, client };
}

export function admitManualAutomation(
  store: Store,
  definition: Pick<AutomationDefinition, 'actions'>,
): () => void {
  const caller = currentControlCaller();
  if (caller === undefined) {
    throw new ApiError('forbidden', 'Running an automation now requires an authenticated caller.');
  }
  const profileId = profileIdOf(store, caller);
  const admit = (): void => {
    const principal = commandPrincipal(store, currentCaller(store, caller, profileId));
    if (
      principal.role !== 'owner' &&
      programActions(automationProgram(store, definition.actions)).some((action) =>
        AI_ACTION_TYPES.has(action.type),
      )
    ) {
      throw new ApiError(
        'forbidden',
        'Only an owner may run automations that wake the AI or use tools.',
      );
    }
  };
  admit();
  return admit;
}
