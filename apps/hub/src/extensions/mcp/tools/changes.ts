import {
  JSON_VALUE,
  privacySwitchOf,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { reported, sendAndWait, type CommandRequest } from './commanding';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
import { TARGET, findCapability, guardDanger, targeted, type Target } from './targets';
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
  value: JSON_VALUE.describe('New value; for an enum its value or label; null runs an action'),
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

function planned(context: ToolContext, asked: Change, confirm: boolean, into: Plan): void {
  for (const placed of targeted(context.store, asked.target)) {
    const device = placed.device;
    const change = privacyChange(device, asked);
    const presented = findCapability(device, change.capability);
    if (presented?.writable !== true) {
      into.skipped.push({
        device_id: device.id,
        device: placed.name,
        reason:
          presented === undefined
            ? `has no ${change.capability}`
            : `${presented.label} is read-only`,
      });
      continue;
    }
    guardDanger(placed, presented, confirm);
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
  confirm: boolean,
): Promise<ToolOutput> {
  const plan: Plan = { commands: [], skipped: [] };
  for (const change of changes) {
    planned(context, change, confirm, plan);
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
