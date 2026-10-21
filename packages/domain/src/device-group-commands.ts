import { z } from 'zod';
import { CAPABILITY_KEY } from './capabilities';
import { validateCommand } from './commands';
import { presentDevice } from './capability-presentation';
import { writePresentedColor } from './presentation/color';
import { HSV_COLOR, JSON_VALUE, type JsonValue } from './values';
import type { DeviceRow } from './api/rows-home';
import type { PresentedCapability } from './presentation/types';
import { DEVICE_TARGET } from './device-targets';
import type { SkipReason } from './target-result';

export const TARGET_CHANGE = z.strictObject({
  target: DEVICE_TARGET,
  capability: z.string().min(1).max(120),
  value: JSON_VALUE,
  scale: z.literal('percent').optional(),
  scope: z
    .enum(['all', 'on'])
    .optional()
    .describe('on changes only members that are currently on; all (default) changes every member'),
});
export type TargetChange = z.infer<typeof TARGET_CHANGE>;
export interface GroupCommand {
  readonly device_id: string;
  readonly capability: string;
  readonly value: JsonValue;
}
export interface SkippedGroupDevice {
  readonly deviceId: string;
  readonly reason: SkipReason;
  readonly detail?: string | undefined;
}
export interface GroupCommandPlan {
  readonly commands: readonly GroupCommand[];
  readonly skipped: readonly SkippedGroupDevice[];
}

export function targetCapability(
  device: DeviceRow,
  reference: string,
): PresentedCapability | undefined {
  const all = presentDevice(device).capabilities;
  return (
    all.find((candidate) => candidate.key === reference) ??
    all.find((candidate) => candidate.role === reference)
  );
}

export function targetValue(
  presented: PresentedCapability,
  value: JsonValue,
  percent: boolean,
): JsonValue {
  const colour = HSV_COLOR.safeParse(value);
  if (
    colour.success &&
    (presented.colorEncoding !== undefined || presented.capability.value.kind === 'color')
  )
    return writePresentedColor(presented, colour.data);
  const descriptor = presented.capability.value;
  if (percent && typeof value === 'number' && descriptor.kind === 'number') {
    const raw = (value / 100) * descriptor.max;
    return Math.min(
      descriptor.max,
      descriptor.min + Math.round((raw - descriptor.min) / descriptor.step) * descriptor.step,
    );
  }
  return value;
}

class UnsupportedControlError extends Error {
  override readonly name = 'UnsupportedControlError';
}

function commandFor(
  device: DeviceRow,
  change: Pick<TargetChange, 'capability' | 'value' | 'scale'>,
): GroupCommand {
  const presented = targetCapability(device, change.capability);
  if (presented?.writable !== true) throw new UnsupportedControlError();
  const value = targetValue(presented, change.value, change.scale === 'percent');
  return {
    device_id: device.id,
    capability: presented.key,
    value: validateCommand(device, { capability: CAPABILITY_KEY.parse(presented.key), value }),
  };
}

export function planGroupCommands(
  devices: readonly DeviceRow[],
  change: Pick<TargetChange, 'capability' | 'value' | 'scale'>,
): GroupCommandPlan {
  const commands: GroupCommand[] = [];
  const skipped: SkippedGroupDevice[] = [];
  for (const device of devices) {
    if (!device.online) {
      skipped.push({ deviceId: device.id, reason: 'offline' });
      continue;
    }
    try {
      commands.push(commandFor(device, change));
    } catch (error) {
      skipped.push({
        deviceId: device.id,
        reason: 'unsupported',
        ...(error instanceof Error && !(error instanceof UnsupportedControlError)
          ? { detail: error.message }
          : {}),
      });
    }
  }
  return { commands, skipped };
}
