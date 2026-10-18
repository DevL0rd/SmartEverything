import { z } from 'zod';
import { signalMatchesV2 } from './automation-v2-watch';
import type { AutomationV2 } from './automation-v2-schema';
import { humanizeEnum } from './presentation/humanize';
import type { DeviceFamily } from './presentation/types';
import type { SignalInput } from './signals';
import { JSON_VALUE } from './values';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DEVICE_LOG_ENTRY_KINDS = ['change', 'press', 'event', 'cycle', 'run'] as const;

export const DEVICE_LOG_CAUSE_KINDS = [
  'device',
  'app',
  'automation',
  'assistant',
  'schedule',
  'button',
  'unknown',
] as const;

export type DeviceLogCauseKind = (typeof DEVICE_LOG_CAUSE_KINDS)[number];

export const DEVICE_LOG_EFFECT_OUTCOMES = ['ok', 'failed', 'skipped', 'running'] as const;

export const DEVICE_LOG_CAUSE = z.strictObject({
  kind: z.enum(DEVICE_LOG_CAUSE_KINDS),
  name: z.string().min(1).optional(),
  id: ID.optional(),
});

export type DeviceLogCause = z.infer<typeof DEVICE_LOG_CAUSE>;

export const DEVICE_LOG_EFFECT = z.strictObject({
  title: z.string().min(1),
  automationId: ID,
  outcome: z.enum(DEVICE_LOG_EFFECT_OUTCOMES),
});

export type DeviceLogEffect = z.infer<typeof DEVICE_LOG_EFFECT>;

export const DEVICE_LOG_ENTRY = z.strictObject({
  at: MOMENT,
  kind: z.enum(DEVICE_LOG_ENTRY_KINDS),
  title: z.string().min(1),
  value: z.string().min(1).optional(),
  started_at: MOMENT.optional(),
  settings: z.record(z.string(), JSON_VALUE).optional(),
  cause: DEVICE_LOG_CAUSE,
  effects: z.array(DEVICE_LOG_EFFECT).optional(),
});

export type DeviceLogEntry = z.infer<typeof DEVICE_LOG_ENTRY>;

export const BUTTON_ACTIONS = ['single_press', 'double_press', 'long_press'] as const;

export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

export const BUTTON_ACTION_TITLES: Readonly<Record<string, string>> = {
  single_press: 'Pressed',
  double_press: 'Double-pressed',
  long_press: 'Held',
  release: 'Released',
};

export function buttonActionTitle(action: string): string {
  return BUTTON_ACTION_TITLES[action] ?? humanizeEnum(action);
}

export const PRESS_EFFECT_WINDOW_MS = 5000;

export const COMMAND_CAUSE_WINDOW_MS = 10_000;

export const REFILL_ITEM = 'fragrance';

export const REFILL_STATE = 'refilled';

export function isRefill(details: Readonly<Record<string, unknown>>): boolean {
  return details['item'] === REFILL_ITEM && details['state'] === REFILL_STATE;
}

export const PHYSICAL_CONTROL_FAMILIES: ReadonlySet<DeviceFamily> = new Set([
  'air_purifier',
  'humidifier',
  'diffuser',
  'microwave',
  'laundry',
  'dehumidifier',
  'tower_fan',
  'fan',
  'heater',
  'air_conditioner',
  'thermostat',
  'switch',
  'plug',
  'television',
  'speaker',
  'lock',
  'cover',
  'vacuum',
  'robot',
  'phone',
]);

export function respondsToSignal(
  definition: Pick<AutomationV2, 'when'>,
  signal: SignalInput,
): boolean {
  return definition.when.some(
    (trigger) => trigger.on === 'signal' && signalMatchesV2(trigger, signal),
  );
}

const CLOCK_TRIGGERS: ReadonlySet<string> = new Set(['time', 'every', 'sun']);

export function runsOnClock(definition: Pick<AutomationV2, 'when'>): boolean {
  return (
    definition.when.length > 0 && definition.when.every((trigger) => CLOCK_TRIGGERS.has(trigger.on))
  );
}
