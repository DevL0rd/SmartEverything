import type {
  ShellyPresenceAction,
  ShellyPresenceDevice,
  ShellyPresenceOutcome,
} from '@smarteverything/domain';
import { shellyOperationResult } from './operation-result';
export function acceptedOutcome(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
  result: unknown = null,
): Extract<ShellyPresenceOutcome, { state: 'accepted' }> {
  const value = shellyOperationResult(action, result);
  return {
    state: 'accepted',
    action: action.action,
    restartRequired: value.kind === 'changed' && value.value.restart_required === true,
    revision: snapshot.revision,
    result: value,
  };
}
