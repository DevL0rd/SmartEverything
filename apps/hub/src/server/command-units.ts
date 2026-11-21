import {
  ApiError,
  CAPABILITY_KEY,
  CommandRefusedError,
  HUB_COMMAND,
  InvalidValueError,
  isHubCapability,
  validateCommand,
  type DeviceScope,
  type ValueDescriptor,
} from '@smarteverything/domain';
import { assertPhoneCommandAllowed } from '../phones/phone-access';
import { storeUnit } from '../store/host/unit';
import type { NewCommand } from '../store/repositories/commands';
import type { HostStore } from '../store/host/host-store';
import type { CheckedInput, CommandPrincipal, CommandsCheck } from './commands';
import { invalid } from './invalid';
import { deviceHidden } from './person-scope';
import { scopesOf } from './person-scope-units';

const OWNER_HUB_COMMANDS: ReadonlySet<string> = new Set(['hub:unlink_provider']);

export const DEVICE_SCOPE_UNIT = storeUnit(
  (store, profileId: string): DeviceScope => scopesOf(store, profileId).devices,
);

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

function deviceCommand(
  store: HostStore,
  input: CheckedInput,
  client: CommandPrincipal,
): NewCommand {
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

export type CheckedCommands =
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
