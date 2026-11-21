import { executionRole, currentExecutionAuthority } from '../assistant/turn-authority';
import { roleOfCaller, clientOf, profileIdOf } from './auth';
import { deviceHidden, deviceReachWhy, scopesOf } from './person-scope';
import { refusal } from './person-access';
import { storeUnit } from '../store/host/unit';
import type { COMMAND_INPUT } from '@smarteverything/domain';
import {
  ApiError,
  CAPABILITY_KEY,
  HUB_COMMAND,
  isHubCapability,
  CommandRefusedError,
  InvalidValueError,
  validateCommand,
  type ValueDescriptor,
  type DeviceScope,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { NewCommand } from '../store/repositories/commands';
import type { Store } from '../store/store';
import type { Caller } from './auth';
import { invalid } from './invalid';
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

export const DEVICE_SCOPE_UNIT = storeUnit(
  (store, profileId: string): DeviceScope => scopesOf(store, profileId).devices,
);

export async function commandPrincipal(
  store: Pick<Store, 'host'>,
  caller: Caller,
): Promise<CommandPrincipal> {
  const role = commandRole(caller);
  const profileId = profileIdOf(caller);
  return {
    clientId: caller.kind === 'service' ? null : clientOf(caller).id,
    role,
    profileId,
    devices: role === 'owner' ? null : await store.host.read('deviceScope', profileId),
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
  if (deviceHidden(client.devices, device)) throw new CommandReachError(device.id);
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

class CommandReachError extends Error {
  override readonly name = 'CommandReachError';

  constructor(readonly deviceId: string) {
    super(`The command names a device outside the person's devices: ${deviceId}.`);
  }
}

export interface CommandsCheck {
  readonly inputs: readonly CheckedInput[];
  readonly principal: CommandPrincipal;
}

type CheckedCommands =
  | { readonly kind: 'checked'; readonly commands: NewCommand[] }
  | { readonly kind: 'unreachable'; readonly deviceId: string }
  | { readonly kind: 'refused'; readonly capability: string; readonly reason: string }
  | {
      readonly kind: 'invalid';
      readonly descriptor: ValueDescriptor;
      readonly received: unknown;
      readonly reason: string;
    };

export const CHECK_COMMANDS_UNIT = storeUnit(
  (store, { inputs, principal }: CommandsCheck): CheckedCommands => {
    try {
      return {
        kind: 'checked',
        commands: inputs.map((input) =>
          isHubCapability(input.capability)
            ? hubCommand(input, principal)
            : deviceCommand(store, input, principal),
        ),
      };
    } catch (cause) {
      if (cause instanceof CommandReachError)
        return { kind: 'unreachable', deviceId: cause.deviceId };
      if (cause instanceof CommandRefusedError)
        return { kind: 'refused', capability: cause.capability, reason: cause.reason };
      if (cause instanceof InvalidValueError)
        return {
          kind: 'invalid',
          descriptor: cause.descriptor,
          received: cause.received,
          reason: cause.reason,
        };
      throw cause;
    }
  },
);

export async function checkedCommands(
  store: Pick<Store, 'host'>,
  inputs: readonly CheckedInput[],
  principal: CommandPrincipal,
): Promise<NewCommand[]> {
  const checked = await store.host.read('checkCommands', { inputs, principal });
  if (checked.kind === 'checked') return checked.commands;
  if (checked.kind === 'refused') throw new CommandRefusedError(checked.capability, checked.reason);
  if (checked.kind === 'invalid')
    throw new InvalidValueError(checked.descriptor, checked.received, checked.reason);
  throw refusal(
    store,
    { id: principal.clientId, profile_id: principal.profileId },
    deviceReachWhy(checked.deviceId),
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
