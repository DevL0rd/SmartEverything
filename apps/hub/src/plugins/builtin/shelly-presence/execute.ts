import { ApiError, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import {
  parseShellyParams,
  type ShellyAction,
  type ShellyResources,
} from '@smarteverything/shelly';
import { ShellyAuthenticationError, ShellyConnectionError } from '@smarteverything/shelly/rpc';
import { z } from 'zod';
import {
  confirmsAfter,
  runShellyAction,
  writtenResource,
  type ShellyOutcome,
  type ShellyRequest,
} from './operate';
import type { OperationPorts } from './ports';
import type { ShellyResource } from './resources';
import type { ShellyParams } from './wire';

const RESTART = z.object({ restart_required: z.literal(true) });

export interface ExecutionHost {
  readonly ports: OperationPorts;
  readonly resources: () => ShellyResources | undefined;
  readonly revision: () => number | null;
  readonly readResource: (resource: ShellyResource) => Promise<unknown>;
  readonly prepare: (action: ShellyAction) => void;
  readonly acknowledge: (action: ShellyAction, params: ShellyParams) => Promise<void>;
  readonly authenticationFailed: (cause: ShellyAuthenticationError) => void;
  readonly failure: (operation: string, cause: unknown) => void;
}

function listRevision(resources: ShellyResources | undefined, resource: ShellyResource): unknown {
  if (resource === 'schedules') return resources?.schedules?.rev;
  return resource === 'webhooks' ? resources?.webhooks?.rev : undefined;
}

async function checkList(host: ExecutionHost, request: ShellyRequest): Promise<void> {
  const resource = writtenResource(request.action);
  if (request.expectedRevision === undefined) return;
  if (resource !== 'schedules' && resource !== 'webhooks') return;
  await host.readResource(resource);
  if (request.expectedRevision !== listRevision(host.resources(), resource))
    throw new ApiError('conflict', 'The sensor list changed. Reload it before saving.');
}

async function confirm(
  host: ExecutionHost,
  action: ShellyAction,
  result: JsonValue,
): Promise<ShellyOutcome> {
  const outcome = {
    state: 'accepted',
    action,
    result,
    restartRequired: RESTART.safeParse(result).success,
    revision: host.revision(),
  } as const;
  if (!confirmsAfter(action)) return outcome;
  try {
    await host.ports.refresh();
    const resource = writtenResource(action);
    if (resource !== undefined) await host.readResource(resource);
    return { ...outcome, revision: host.revision(), confirmed: true };
  } catch (cause) {
    host.failure('operation_confirmation', cause);
    return { ...outcome, confirmed: false };
  }
}

export async function executeShelly(
  host: ExecutionHost,
  request: ShellyRequest,
): Promise<ShellyOutcome> {
  const { action } = request;
  const params = parseShellyParams(action, request.params);
  await checkList(host, request);
  host.prepare(action);
  try {
    const result = await runShellyAction(host.ports, action, params);
    await host.acknowledge(action, params);
    return await confirm(host, action, JSON_VALUE.parse(result));
  } catch (cause) {
    if (cause instanceof ShellyAuthenticationError) host.authenticationFailed(cause);
    if (cause instanceof ShellyConnectionError)
      return { state: 'unknown', action, message: cause.message };
    throw cause;
  }
}
