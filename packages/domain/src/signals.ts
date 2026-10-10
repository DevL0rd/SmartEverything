import { z } from 'zod';
import { COMPARISON, jsonEquals } from './comparison';
import { JSON_VALUE, type JsonValue } from './values';

export const SIGNAL_LIMITS = {
  windowSeconds: 3600,
  holdSeconds: 86_400,
  debounceSeconds: 3600,
  cooldownSeconds: 86_400,
  windowSamples: 2000,
} as const;

const JSON_OBJECT = z.record(z.string(), JSON_VALUE);

export const SIGNAL_SOURCE_NAME = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'a lowercase source name');

export const SIGNAL_INPUT = z.strictObject({
  source: SIGNAL_SOURCE_NAME,
  kind: z.string().min(1).max(80),
  subject: z.string().min(1).max(200).nullable(),
  field: z.string().min(1).max(120).nullable(),
  value: JSON_VALUE,
  previous: JSON_VALUE.nullable(),
  at: z.iso.datetime({ offset: true }),
  profileId: z.uuid().nullable(),
  data: JSON_OBJECT,
});

export type SignalInput = z.infer<typeof SIGNAL_INPUT>;

export function signalKey(
  signal: Pick<SignalInput, 'source' | 'kind' | 'subject' | 'field'>,
): string {
  return [signal.source, signal.kind, signal.subject ?? '', signal.field ?? ''].join('|');
}

export const SIGNAL_WINDOW_MODES = ['avg', 'min', 'max', 'rate', 'count'] as const;

export type SignalWindowMode = (typeof SIGNAL_WINDOW_MODES)[number];

export const SIGNAL_WINDOW = z.strictObject({
  mode: z.enum(SIGNAL_WINDOW_MODES),
  seconds: z.int().min(1).max(SIGNAL_LIMITS.windowSeconds),
});

export type SignalWindow = z.infer<typeof SIGNAL_WINDOW>;

const SECONDS = (longest: number): z.ZodDefault<z.ZodInt> => z.int().min(0).max(longest).default(0);

export const SIGNAL_TRIGGER = z
  .strictObject({
    type: z.literal('signal'),
    source: SIGNAL_SOURCE_NAME.describe('Signal source, e.g. device, event, weather'),
    kind: z.string().min(1).max(80).describe('Signal kind within the source, e.g. state or person'),
    subject: z
      .string()
      .min(1)
      .max(200)
      .nullable()
      .default(null)
      .describe('Only this subject (device id, person id…); null for any'),
    field: z
      .string()
      .min(1)
      .max(120)
      .nullable()
      .default(null)
      .describe('Only this field, e.g. a capability for device state; null for any'),
    match: z
      .record(z.string().min(1).max(80), JSON_VALUE)
      .default({})
      .describe(
        'Details that must match exactly, using only the kind’s match keys from list_signal_kinds, e.g. {"detection":"baby_cry"} for kind sound',
      ),
    comparison: COMPARISON.nullable()
      .default(null)
      .describe('Compared with the value (or the window result); null fires on every signal'),
    window: SIGNAL_WINDOW.nullable()
      .default(null)
      .describe('Rolling window: avg, min, max, rate (change per minute) or count over seconds'),
    debounceSeconds: SECONDS(SIGNAL_LIMITS.debounceSeconds).describe(
      'Decide only after no new signal for this long',
    ),
    holdSeconds: SECONDS(SIGNAL_LIMITS.holdSeconds).describe(
      'The comparison must stay true this long before it fires',
    ),
    cooldownSeconds: SECONDS(SIGNAL_LIMITS.cooldownSeconds).describe(
      'Fire at most once in this long',
    ),
  })
  .describe('Fires on any signal in the home: device values, events, weather and more');

export type SignalTrigger = z.output<typeof SIGNAL_TRIGGER>;

export function signalMatches(trigger: SignalTrigger, signal: SignalInput): boolean {
  return (
    trigger.source === signal.source &&
    trigger.kind === signal.kind &&
    (trigger.subject === null || trigger.subject === signal.subject) &&
    (trigger.field === null || trigger.field === signal.field) &&
    Object.entries(trigger.match).every(([key, value]) => {
      const actual = signal.data[key];
      return actual !== undefined && jsonEquals(actual, value);
    })
  );
}

export interface WindowSample {
  readonly atMs: number;
  readonly value: JsonValue;
}

const MINUTE_MS = 60_000;

function numbers(samples: readonly WindowSample[]): number[] {
  return samples.flatMap((sample) => (typeof sample.value === 'number' ? [sample.value] : []));
}

function ratePerMinute(samples: readonly WindowSample[]): number | null {
  const numeric = samples.filter((sample) => typeof sample.value === 'number');
  const first = numeric[0];
  const last = numeric[numeric.length - 1];
  if (first === undefined || last === undefined || last.atMs === first.atMs) {
    return null;
  }
  return ((Number(last.value) - Number(first.value)) * MINUTE_MS) / (last.atMs - first.atMs);
}

export function windowValue(
  mode: SignalWindowMode,
  samples: readonly WindowSample[],
): number | null {
  if (mode === 'count') {
    return samples.length;
  }
  if (mode === 'rate') {
    return ratePerMinute(samples);
  }
  const values = numbers(samples);
  if (values.length === 0) {
    return null;
  }
  switch (mode) {
    case 'avg':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}
