import {
  COLOR_INPUT_FORMS,
  JSON_VALUE,
  deviceFamily,
  memberOutcomes,
  privacySwitchOf,
  targetResultHeadline,
  targetValue,
  type DeviceRow,
  type JsonValue,
  type PresentedCapability,
  type ResultNoun,
} from '@smarteverything/domain';
import { z } from 'zod';
import { litMembers } from '../../../device-groups/commands';
import { reported, sendAndWait, type CommandRequest } from './commanding';
import { deviceScopeOfActor } from './person-reach';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
import { TARGET_FIELDS, findCapability, hasTarget, targeted, type Target } from './targets';
import { VALUE_UNIT, valueFor, type TemperatureUnit } from './values';

export interface Change {
  readonly target: Target;
  readonly capability: string;
  readonly value: JsonValue;
  readonly unit?: TemperatureUnit | undefined;
  readonly scale?: 'percent' | undefined;
  readonly scope?: 'all' | 'on' | undefined;
}

export const DEVICE_CONTROL = z.strictObject({
  ...TARGET_FIELDS,
  capability: z
    .string()
    .min(1)
    .max(120)
    .default('power')
    .describe(
      'Capability key, role (such as power or target_temperature) or label; power when left out',
    ),
  value: JSON_VALUE.describe(
    `New value in the capability’s value_format from device_read: true or false; a number in its unit; an enum option or its label; a colour as ${COLOR_INPUT_FORMS}; null runs an action. Brightness, fan speed and white tone are their own capabilities (white tone: kelvin as a number, "2700K" or "370 mireds")`,
  ),
  unit: VALUE_UNIT,
  scale: z
    .literal('percent')
    .optional()
    .describe('percent takes a number as 0 to 100 of each device’s own range'),
  scope: z
    .enum(['all', 'on'])
    .optional()
    .describe('on changes only devices that are currently on; all (default) changes every device'),
});
export type DeviceControl = z.infer<typeof DEVICE_CONTROL>;

export function changeOf(input: DeviceControl): Change {
  const { capability, value, unit, scale, scope, ...target } = input;
  if (!hasTarget(target)) {
    throw new ToolError(
      'Name the devices: give deviceIds, group, rooms, families or search (device_find lists devices)',
    );
  }
  return { target, capability, value, unit, scale, scope };
}

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
  'raw controls exist only where that device’s device_read lists them; ask the person instead of guessing raw ids';

function missingReason(capability: string): string {
  return capability.startsWith(RAW_PREFIX)
    ? `has no ${capability}; ${RAW_GUIDANCE}`
    : `has no ${capability}`;
}

function requireResolvedRaw(change: Change): void {
  if (change.capability.startsWith(RAW_PREFIX) && change.target.deviceIds === undefined) {
    throw new ToolError(
      `${change.capability} is a raw control of one device: read that device with device_read and target it by deviceIds; ${RAW_GUIDANCE}`,
    );
  }
}

function valueOf(presented: PresentedCapability, change: Change): JsonValue {
  return change.scale === 'percent'
    ? targetValue(presented, change.value, true)
    : valueFor(presented, change.value, change.unit);
}

function planned(context: ToolContext, asked: Change, into: Plan): void {
  const placedAll = targeted(context.store, deviceScopeOfActor(context), asked.target);
  const lit = new Set(
    asked.scope === 'on'
      ? litMembers(
          context.store,
          placedAll.map(({ device }) => device),
        ).map((device) => device.id)
      : placedAll.map(({ device }) => device.id),
  );
  for (const placed of placedAll) {
    const device = placed.device;
    if (!lit.has(device.id)) {
      into.skipped.push({
        device_id: device.id,
        device: placed.name,
        reason: 'is off, scope is on',
      });
      continue;
    }
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
      value: valueOf(presented, change),
    });
  }
}

function nounOf(context: ToolContext, commands: readonly CommandRequest[]): ResultNoun {
  return commands.every((command) => {
    const device = command.device_id === null ? undefined : context.store.devices.find(command.device_id);
    return device !== undefined && deviceFamily(device) === 'light';
  })
    ? 'light'
    : 'device';
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
  return {
    structured: {
      ...reported(context, outcome),
      headline: targetResultHeadline(
        memberOutcomes([], outcome.commands),
        nounOf(context, plan.commands),
      ),
      skipped: plan.skipped,
    },
  };
}
