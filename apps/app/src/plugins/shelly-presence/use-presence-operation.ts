import { Logger } from '@smarteverything/logging';
import { useState } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { shellyOperation, type ShellyDevice } from '@smarteverything/shelly';
import { z } from 'zod';
import type { ConfirmRequest } from '../../components/confirm-store';
import { confirmed } from '../shared/confirmed';
import { notify } from '../../components/toast-store';
import {
  isDestructive,
  operatePresence,
  type AcceptedOutcome,
  type PresenceRequest,
} from './presence-operation';

const log = new Logger('app.shelly-presence');
export interface PresenceOperation {
  readonly busy: boolean;
  readonly message: string | null;
  readonly error: string | null;
  readonly result: JsonValue | null;
  readonly run: (request: PresenceRequest) => Promise<boolean>;
}

type OperationView = Omit<PresenceOperation, 'run'>;

const EMPTY: OperationView = { busy: false, message: null, error: null, result: null };

function acceptedMessage(outcome: AcceptedOutcome): string {
  if (outcome.restartRequired) return 'Accepted. This device needs a restart.';
  return outcome.confirmed === false
    ? 'Accepted. Refresh the device to confirm its latest state.'
    : 'Accepted by the device.';
}

export function failure(error: unknown): string {
  if (error instanceof z.ZodError) return z.prettifyError(error);
  return error instanceof Error ? error.message : String(error);
}

export function confirmation(request: PresenceRequest): ConfirmRequest | undefined {
  if (!isDestructive(request.action)) return undefined;
  const { title } = shellyOperation(request.action);
  return {
    title: `${title}?`,
    body: 'This cannot be undone.',
    confirmLabel: title,
    tone: 'destructive',
  };
}

export async function performOperation(
  sensor: ShellyDevice,
  request: PresenceRequest,
): Promise<{ readonly state: OperationView; readonly saved: boolean }> {
  try {
    const operation = log.operation('presence.operate', {
      externalId: sensor.externalId,
      action: request.action,
    });
    shellyOperation(request.action).params.parse(request.params ?? {});
    const outcome = await operatePresence(sensor, request).catch((error: unknown) => {
      operation.failed(error);
      throw error;
    });
    operation.succeeded({ state: outcome.state });
    if (outcome.state === 'unknown')
      return { state: { ...EMPTY, error: outcome.message }, saved: false };
    return {
      state: { ...EMPTY, result: outcome.result, message: acceptedMessage(outcome) },
      saved: true,
    };
  } catch (error) {
    return { state: { ...EMPTY, error: failure(error) }, saved: false };
  }
}

export function usePresenceOperation(sensor: ShellyDevice): PresenceOperation {
  const [state, change] = useState(EMPTY);
  const run = async (request: PresenceRequest): Promise<boolean> => {
    if (!(await confirmed(confirmation(request)))) return false;
    change({ ...EMPTY, busy: true });
    const performed = await performOperation(sensor, request);
    change(performed.state);
    if (performed.state.error !== null)
      notify({
        message: 'Shelly change not saved',
        detail: performed.state.error,
        tone: 'critical',
      });
    return performed.saved;
  };
  return { ...state, run };
}
