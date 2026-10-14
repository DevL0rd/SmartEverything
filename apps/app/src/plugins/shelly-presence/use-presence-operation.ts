import { useState } from 'react';
import {
  shellyPresencePermission,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
  type ShellyPresenceOutcome,
  type ShellyOperationResult,
} from '@smarteverything/domain';
import { useIsOwner } from '../../store/selectors';
import { operatePresence } from './presence-data';
import { usePresenceResourceRefresh } from './resource-refresh';
interface OperationState {
  readonly result: ShellyOperationResult | null;
  readonly acceptedRevision: number | null;
  readonly resourceRevision: number | null;
  readonly acceptedEtag: string | null;
  readonly busy: boolean;
  readonly message: string | null;
  readonly error: string | null;
}
export interface PresenceOperation extends OperationState {
  readonly run: (operation: ShellyPresenceAction) => Promise<boolean>;
  readonly resetAcceptance: () => void;
}
const EMPTY: OperationState = {
  result: null,
  acceptedRevision: null,
  resourceRevision: null,
  acceptedEtag: null,
  busy: false,
  message: null,
  error: null,
};
function acceptedState(
  previous: OperationState,
  outcome: Extract<ShellyPresenceOutcome, { readonly state: 'accepted' }>,
  refreshFailed: boolean,
): OperationState {
  const changed = outcome.result?.kind === 'changed' ? outcome.result.value : null;
  return {
    ...previous,
    busy: false,
    error: null,
    result: outcome.result ?? null,
    acceptedRevision: outcome.revision,
    resourceRevision: changed?.rev ?? previous.resourceRevision,
    acceptedEtag: changed?.etag ?? previous.acceptedEtag,
    message: acceptanceMessage(outcome, refreshFailed),
  };
}
function acceptanceMessage(
  outcome: Extract<ShellyPresenceOutcome, { readonly state: 'accepted' }>,
  refreshFailed: boolean,
): string {
  if (refreshFailed) return 'Accepted. Reload stored values to confirm the latest device state.';
  if (outcome.restartRequired) return 'Accepted. This device needs a restart.';
  return outcome.readback === 'unavailable'
    ? 'Accepted. Settings readback is unavailable; refresh to verify.'
    : 'Accepted by the device.';
}
async function refreshStoredResource(
  action: ShellyPresenceAction,
  refresh: (() => Promise<void>) | null,
): Promise<boolean> {
  if (
    refresh === null ||
    !action.action.startsWith('kvs_') ||
    shellyPresencePermission(action) === 'read'
  )
    return false;
  try {
    await refresh();
    return false;
  } catch {
    return true;
  }
}
export function usePresenceOperation(sensor: ShellyPresenceDevice): PresenceOperation {
  const [state, change] = useState(EMPTY);
  const owner = useIsOwner();
  const refresh = usePresenceResourceRefresh();
  const run = async (operation: ShellyPresenceAction): Promise<boolean> => {
    change((previous) => ({ ...previous, busy: true, error: null, message: null, result: null }));
    try {
      if (shellyPresencePermission(operation) === 'access' && !owner)
        throw new Error('The home owner must grant this access.');
      const outcome = await operatePresence(sensor, operation);
      if (outcome.state === 'unknown') {
        change((previous) => ({ ...previous, busy: false, error: outcome.message }));
        return false;
      }
      const refreshFailed = await refreshStoredResource(operation, refresh);
      change((previous) => acceptedState(previous, outcome, refreshFailed));
      return true;
    } catch (error) {
      change((previous) => ({
        ...previous,
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      return false;
    }
  };
  return {
    ...state,
    run,
    resetAcceptance: (): void => {
      change((previous) => ({
        ...previous,
        acceptedRevision: null,
        resourceRevision: null,
        acceptedEtag: null,
      }));
    },
  };
}
