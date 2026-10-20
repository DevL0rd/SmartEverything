import { z } from 'zod';
import { signalViewOf } from './automation-v3/signal-view';
import type { AutomationV3 } from './automation-v3/program';
import type { TriggerNode } from './automation-v3/node';
import { humanizeEnum } from './presentation/humanize';
import type { DeviceFamily } from './presentation/types';
import { SIGNAL_MATCHER, signalMatches, type SignalMatcher } from './signal-matcher';
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

type Triggered = Pick<AutomationV3, 'triggers'>;

function matcherOf(trigger: TriggerNode): SignalMatcher | undefined {
  const view = trigger.enabled === false ? undefined : signalViewOf(trigger);
  const parsed = view === undefined ? undefined : SIGNAL_MATCHER.safeParse(view);
  return parsed?.success === true ? parsed.data : undefined;
}

export function respondsToSignal(program: Triggered, signal: SignalInput): boolean {
  return program.triggers.some((trigger) => {
    const matcher = matcherOf(trigger);
    return matcher !== undefined && signalMatches(matcher, signal);
  });
}

const CLOCK_TRIGGERS: ReadonlySet<string> = new Set([
  'trigger.time',
  'trigger.interval',
  'trigger.sun',
]);

export function runsOnClock(program: Triggered): boolean {
  return (
    program.triggers.length > 0 &&
    program.triggers.every((trigger) => CLOCK_TRIGGERS.has(trigger.kind))
  );
}
