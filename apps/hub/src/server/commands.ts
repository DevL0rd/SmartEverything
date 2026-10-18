import { executionRole, currentExecutionAuthority } from '../assistant/turn-authority';
import { roleOfCaller, clientOf, profileIdOf } from './auth';
import { assertDeviceReach, scopesOf, scopesOfClient } from './person-scope';
import type { COMMAND_INPUT } from '@smarteverything/domain';
import {
  ApiError,
  CAPABILITY_KEY,
  HUB_COMMAND,
  isHubCapability,
  validateCommand,
  type ClientRow,
  type DeviceScope,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { NewCommand } from '../store/repositories/commands';
import type { Store } from '../store/store';
import type { Caller } from './auth';
import { invalid } from './errors';
import { assertPhoneCommandAllowed } from '../phones/phone-access';

const OWNER_HUB_COMMANDS: ReadonlySet<string> = new Set(['hub:unlink_provider']);

export type CheckedInput = Omit<z.output<typeof COMMAND_INPUT>, 'source'> & {
  readonly source: NewCommand['source'];
};

export interface CommandPrincipal {
  readonly clientId: string | null;
  readonly role: 'owner' | 'member';
  readonly profileId: string;
  readonly devices: DeviceScope | null;
}

export function commandRole(caller: Caller): CommandPrincipal['role'] {
  const authority = caller.kind === 'service' ? undefined : currentExecutionAuthority();
  const member = authority !== undefined && executionRole(authority) === 'member';
  return member ? 'member' : roleOfCaller(caller);
}

export function commandPrincipal(store: Store, caller: Caller): CommandPrincipal {
  const role = commandRole(caller);
  const profileId = profileIdOf(store, caller);
  return {
    clientId: caller.kind === 'service' ? null : clientOf(caller).id,
    role,
    profileId,
    devices: role === 'owner' ? null : scopesOf(store, profileId).devices,
  };
}

function principalOf(store: Store, client: ClientRow | CommandPrincipal): CommandPrincipal {
  if ('clientId' in client) return client;
  const scopes = scopesOfClient(store, client);
  return {
    clientId: client.id,
    role: client.role,
    profileId: store.profiles.activeOf(client.id).id,
    devices: scopes?.devices ?? null,
  };
}

function hubCommandRequiresOwner(capability: string): boolean {
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
  assertDeviceReach(
    store,
    { id: client.clientId, profile_id: client.profileId },
    client.devices,
    device,
  );
  const capability = CAPABILITY_KEY.safeParse(input.capability);
  if (!capability.success) {
    throw invalid('capability', capability.error);
  }
  const value = validateCommand(device, { capability: capability.data, value: input.value });
  assertPhoneCommandAllowed(device, capability.data, client);
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
      ? hubCommand(input, principalOf(store, client))
      : deviceCommand(store, input, principalOf(store, client)),
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
