import type { COMMAND_INPUT } from '@smarteverything/domain';
import {
  ApiError,
  CAPABILITY_KEY,
  HUB_COMMAND,
  isHubCapability,
  validateCommand,
  type ClientRow,
  type HubCommand,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { NewCommand } from '../store/repositories/commands';
import type { Store } from '../store/store';
import type { Caller } from './auth';
import { invalid } from './errors';

const OWNER_HUB_COMMANDS: ReadonlySet<HubCommand['capability']> = new Set([
  'hub:link_provider',
  'hub:answer_prompt',
  'hub:unlink_provider',
]);

export type CheckedInput = Omit<z.output<typeof COMMAND_INPUT>, 'source'> & {
  readonly source: NewCommand['source'];
};

function hubCommand(input: CheckedInput, client: ClientRow): NewCommand {
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
  if (OWNER_HUB_COMMANDS.has(command.data.capability) && client.role !== 'owner') {
    throw new ApiError('forbidden', `Only an owner may send ${command.data.capability}.`);
  }
  return { ...command.data, deviceId: null, source: input.source, requestedBy: client.id };
}

function deviceCommand(store: Store, input: CheckedInput, client: ClientRow): NewCommand {
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
    requestedBy: client.id,
  };
}

export function checkedCommands(
  store: Store,
  inputs: readonly CheckedInput[],
  client: ClientRow,
): NewCommand[] {
  return inputs.map((input) =>
    isHubCapability(input.capability)
      ? hubCommand(input, client)
      : deviceCommand(store, input, client),
  );
}

export function sourcedBy(caller: Caller, inputs: readonly CheckedInput[]): CheckedInput[] {
  const assistant = caller.kind === 'client' && caller.via === 'assistant';
  return inputs.map((input) =>
    assistant && input.source === 'app' ? { ...input, source: 'assistant' } : input,
  );
}
