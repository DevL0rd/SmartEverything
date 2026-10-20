import {
  CLOCK_TIME,
  ERROR_CLASS,
  JSON_VALUE,
  SIGNAL_INPUT,
  minuteOfClock,
  zonedInstant,
} from '@smarteverything/domain';
import type { SignalInput } from '@smarteverything/domain';
import { z } from 'zod';

const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

export const STEP_LIMIT = 1_000_000;

const INSTANT = z.iso.datetime({ offset: true });

const LOCAL_START = z.strictObject({
  date: z.iso.date(),
  clock: CLOCK_TIME,
  zone: z.string().min(1),
});

const DEVICE_OVERRIDE = z.strictObject({
  device: z.string().min(1),
  control: z.string().min(1),
  value: JSON_VALUE,
});

const VARIABLE_OVERRIDE = z.strictObject({
  automationId: z.string().min(1),
  name: z.string().min(1),
  value: JSON_VALUE,
});

const EFFECT_OUTCOME = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ok') }),
  z.strictObject({
    kind: z.literal('fail'),
    class: ERROR_CLASS.default('Failed'),
    message: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('offline') }),
  z.strictObject({ kind: z.literal('unknown') }),
  z.strictObject({ kind: z.literal('slow'), delayMs: z.int().min(1) }),
]);

const EFFECT_SCRIPT = z.strictObject({
  kind: z.string().min(1).optional(),
  device: z.string().min(1).optional(),
  outcome: EFFECT_OUTCOME,
});

const SIGNAL_BODY = SIGNAL_INPUT.omit({ at: true });

const TIMELINE_ENTRY = z.union([
  z.strictObject({ at: INSTANT, signal: SIGNAL_BODY }),
  z.strictObject({ at: INSTANT, device: DEVICE_OVERRIDE }),
  z.strictObject({ at: INSTANT, answer: z.string().min(1) }),
]);

export const OVERRIDES = z.strictObject({
  devices: z.array(DEVICE_OVERRIDE).default([]),
  variables: z.array(VARIABLE_OVERRIDE).default([]),
  effects: z.array(EFFECT_SCRIPT).default([]),
});

export const SCENARIO = OVERRIDES.extend({
  start: z.union([INSTANT, LOCAL_START]),
  horizonMs: z.int().min(1).max(HORIZON_MS).default(HORIZON_MS),
  timeline: z.array(TIMELINE_ENTRY).default([]),
});

type DeviceOverride = z.infer<typeof DEVICE_OVERRIDE>;
export type EffectScript = z.infer<typeof EFFECT_SCRIPT>;
export type EffectOutcome = z.infer<typeof EFFECT_OUTCOME>;
export type Overrides = z.output<typeof OVERRIDES>;
export type ScenarioInput = z.input<typeof SCENARIO>;

export type TimelineEvent =
  | { readonly at: number; readonly signal: SignalInput }
  | { readonly at: number; readonly device: DeviceOverride }
  | { readonly at: number; readonly answer: string };

export interface Scenario extends Overrides {
  readonly startMs: number;
  readonly zone: string | undefined;
  readonly endMs: number;
  readonly timeline: readonly TimelineEvent[];
}

function startOf(start: z.output<typeof SCENARIO>['start']): { ms: number; zone?: string } {
  if (typeof start === 'string') return { ms: Date.parse(start) };
  const [year = 0, month = 0, day = 0] = start.date.split('-').map(Number);
  const instant = zonedInstant({ year, month, day }, minuteOfClock(start.clock), start.zone);
  return { ms: instant.getTime(), zone: start.zone };
}

function eventOf(entry: z.output<typeof TIMELINE_ENTRY>): TimelineEvent {
  const at = Date.parse(entry.at);
  if ('device' in entry) return { at, device: entry.device };
  if ('answer' in entry) return { at, answer: entry.answer };
  return { at, signal: { ...entry.signal, at: entry.at } };
}

export function parseScenario(input: ScenarioInput): Scenario {
  const parsed = SCENARIO.parse(input);
  const start = startOf(parsed.start);
  const timeline = parsed.timeline.map(eventOf).sort((first, second) => first.at - second.at);
  return {
    devices: parsed.devices,
    variables: parsed.variables,
    effects: parsed.effects,
    startMs: start.ms,
    zone: start.zone,
    endMs: start.ms + parsed.horizonMs,
    timeline,
  };
}
