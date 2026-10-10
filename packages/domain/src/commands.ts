import { z } from 'zod';
import { CAPABILITY_KEY } from './capabilities';
import { capabilityOf, type DiscoveredDevice } from './devices';
import { checkValue, JSON_VALUE, type JsonValue } from './values';

export const COMMAND_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'expired'] as const;

export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export const COMMAND_REQUEST = z.object({
  deviceId: z.uuid(),
  capability: CAPABILITY_KEY,
  value: JSON_VALUE,
});

export type CommandRequest = z.infer<typeof COMMAND_REQUEST>;

export const DEVICE_COMMAND = z.object({
  commandId: z.uuid(),
  externalId: z.string().min(1),
  capability: CAPABILITY_KEY,
  value: JSON_VALUE,
});

export type DeviceCommand = z.infer<typeof DEVICE_COMMAND>;

export class CommandRefusedError extends Error {
  override readonly name = 'CommandRefusedError';

  constructor(
    readonly capability: string,
    readonly reason: string,
  ) {
    super(`The command for ${capability} was refused: ${reason}.`);
  }
}

export function validateCommand(
  device: Pick<DiscoveredDevice, 'capabilities'>,
  request: Pick<CommandRequest, 'capability' | 'value'>,
): JsonValue {
  const capability = capabilityOf(device, request.capability);
  if (capability === undefined) {
    throw new CommandRefusedError(request.capability, 'the device does not have it');
  }
  if (capability.access === 'read') {
    throw new CommandRefusedError(request.capability, 'it can only be read');
  }
  return checkValue(capability.value, request.value);
}

export function isFinished(status: CommandStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'expired';
}
