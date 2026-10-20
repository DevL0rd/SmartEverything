import {
  COLOR_INPUT_FORMS,
  JSON_VALUE,
  privacySwitchOf,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { reported, sendAndWait, type CommandRequest } from './commanding';
import { deviceScopeOfActor } from './person-reach';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
import { TARGET, findCapability, targeted, type Target } from './targets';
import { VALUE_UNIT, valueFor, type TemperatureUnit } from './values';

export interface Change {
  readonly target: Target;
  readonly capability: string;
  readonly value: JsonValue;
  readonly unit?: TemperatureUnit | undefined;
}

export const CHANGE = z.strictObject({
  target: TARGET,
  capability: z
    .string()
    .min(1)
    .max(120)
    .describe('Capability key, role (such as power or target_temperature) or label'),
  value: JSON_VALUE.describe(
    `New value in the capability’s value_format from get_device: true or false; a number in its unit; an enum option or its label; a colour as ${COLOR_INPUT_FORMS}; null runs an action. Brightness and white tone are their own capabilities (white tone: kelvin as a number, "2700K" or "370 mireds")`,
  ),
  unit: VALUE_UNIT,
});

interface Skipped {
  readonly device_id: string;
  readonly device: string;
  readonly reason: string;
}

interface Plan {
  readonly commands: CommandRequest[];
  readonly skipped: Skipped[];
}

function privacyChange(device: DeviceRow, change: Change): Change {
  const privacy = privacySwitchOf(device);
  if (
    change.capability !== 'privacy_mode' ||
    privacy?.key !== 'power' ||
    typeof change.value !== 'boolean'
  ) {
    return change;
  }
  return {
    ...change,
    capability: 'power',
    value: change.value ? privacy.privateWhen : !privacy.privateWhen,
  };
}

const RAW_PREFIX = 'raw:';

const RAW_GUIDANCE =
  'raw controls exist only where that device’s get_device lists them; ask the person instead of guessing raw ids';

function missingReason(capability: string): string {
  return capability.startsWith(RAW_PREFIX)
    ? `has no ${capability}; ${RAW_GUIDANCE}`
    : `has no ${capability}`;
}

function requireResolvedRaw(change: Change): void {
  if (change.capability.startsWith(RAW_PREFIX) && change.target.deviceIds === undefined) {
    throw new ToolError(
      `${change.capability} is a raw control of one device: read that device with get_device and target it by deviceIds; ${RAW_GUIDANCE}`,
    );
  }
}

function planned(context: ToolContext, asked: Change, into: Plan): void {
  for (const placed of targeted(context.store, deviceScopeOfActor(context), asked.target)) {
    const device = placed.device;
    const change = privacyChange(device, asked);
    const presented = findCapability(device, change.capability);
    if (presented?.writable !== true) {
      into.skipped.push({
        device_id: device.id,
        device: placed.name,
        reason:
          presented === undefined
            ? missingReason(change.capability)
            : `${presented.label} is read-only`,
      });
      continue;
    }
    into.commands.push({
      device_id: device.id,
      capability: presented.key,
      value: valueFor(presented, change.value, change.unit),
    });
  }
}

export async function applyChanges(
  context: ToolContext,
  changes: readonly Change[],
): Promise<ToolOutput> {
  const plan: Plan = { commands: [], skipped: [] };
  changes.forEach(requireResolvedRaw);
  for (const change of changes) {
    planned(context, change, plan);
  }
  if (plan.commands.length === 0) {
    throw new ToolError(
      `None of the chosen devices can do this: ${plan.skipped.map((skip) => `${skip.device} ${skip.reason}`).join('; ')}`,
      'not_supported',
    );
  }
  const outcome = await sendAndWait(context, plan.commands);
  return { structured: { ...reported(context, outcome), skipped: plan.skipped } };
}
