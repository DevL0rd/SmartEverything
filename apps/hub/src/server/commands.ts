import {
  executionRole,
  currentExecutionAuthority,
  currentExecutionAuthorities,
  validateExecutionAuthority,
} from '../assistant/execution-authority';
import { roleOfCaller, clientOf } from './auth';
import type { COMMAND_INPUT } from '@smarteverything/domain';
import {
  ApiError,
  CAPABILITY_KEY,
  HUB_COMMAND,
  isHubCapability,
  validateCommand,
  type ClientRow,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { NewCommand } from '../store/repositories/commands';
import type { Store } from '../store/store';
import type { Caller } from './auth';
import { invalid } from './errors';

const OWNER_HUB_COMMANDS: ReadonlySet<string> = new Set([
  'hub:link_provider',
  'hub:answer_prompt',
  'hub:unlink_provider',
]);

export type CheckedInput = Omit<z.output<typeof COMMAND_INPUT>, 'source'> & {
  readonly source: NewCommand['source'];
};

export interface CommandPrincipal {
  readonly clientId: string | null;
  readonly role: 'owner' | 'member';
}
export function commandPrincipal(store: Store, caller: Caller): CommandPrincipal {
  if (caller.kind === 'service') {
    validateExecutionAuthority(store, caller.authority);
    if (caller.authority.profile_id !== caller.profileId)
      throw new ApiError('forbidden', 'Command changed its initiating service profile.');
    return { clientId: null, role: 'member' };
  }
  const member = currentExecutionAuthorities().some(
    (authority) => executionRole(store, authority) === 'member',
  );
  return { clientId: clientOf(caller).id, role: member ? 'member' : roleOfCaller(caller) };
}
function principalOf(client: ClientRow | CommandPrincipal): CommandPrincipal {
  return 'clientId' in client ? client : { clientId: client.id, role: client.role };
}
export function hubCommandRequiresOwner(capability: string): boolean {
  return OWNER_HUB_COMMANDS.has(capability);
}
function hubCommand(input: CheckedInput, client: CommandPrincipal): NewCommand {
  if (input.device_id !== null) {
    throw new ApiError(
      'command_refused',
      `${input.capability} is a hub command and names no device.`,
    );
  }
  const command = HUB_COMMAND.safeParse({ capability: input.capability, value: input.value });
  if (!command.success) {
    throw invalid(`${input.capability} command`, command.error);
  }
  if (hubCommandRequiresOwner(command.data.capability) && client.role !== 'owner') {
    throw new ApiError('forbidden', `Only an owner may send ${command.data.capability}.`);
  }
  return { ...command.data, deviceId: null, source: input.source, requestedBy: client.clientId };
}

function deviceCommand(store: Store, input: CheckedInput, client: CommandPrincipal): NewCommand {
  if (input.device_id === null) {
    throw new ApiError(
      'command_refused',
      `${input.capability} is a device capability; name the device.`,
    );
  }
  const device = store.devices.byId(input.device_id);
  const capability = CAPABILITY_KEY.safeParse(input.capability);
  if (!capability.success) {
    throw invalid('capability', capability.error);
  }
  const value = validateCommand(device, { capability: capability.data, value: input.value });
  return {
    deviceId: device.id,
    capability: capability.data,
    value,
    source: input.source,
    requestedBy: client.clientId,
    effectPolicy: input.effect_policy,
  };
}

export function checkedCommands(
  store: Store,
  inputs: readonly CheckedInput[],
  client: ClientRow | CommandPrincipal,
): NewCommand[] {
  return inputs.map((input) =>
    isHubCapability(input.capability)
      ? hubCommand(input, principalOf(client))
      : deviceCommand(store, input, principalOf(client)),
  );
}

export function sourcedBy(caller: Caller, inputs: readonly CheckedInput[]): CheckedInput[] {
  const authority = caller.kind === 'service' ? caller.authority : currentExecutionAuthority();
  const assistant =
    caller.kind === 'service' || (caller.kind === 'client' && caller.via === 'assistant');
  return inputs.map((input) =>
    assistant && (authority !== undefined || input.source === 'app')
      ? { ...input, source: 'assistant' }
      : input,
  );
}
