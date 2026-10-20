import { z } from 'zod';
import { compare, jsonEquals } from './comparison';
import { SIGNAL_LIMITS, SIGNAL_WINDOW_MODES } from './signals';
import { JSON_VALUE, type JsonValue } from './values';
import { localClock } from './zoned-clock';

export const SIGNAL_FIRST_PERIODS = ['day', 'week', 'ever'] as const;
export type SignalFirstPeriod = (typeof SIGNAL_FIRST_PERIODS)[number];

const TEST_CASES = [
  z.strictObject({ is: z.enum(['eq', 'ne']), to: JSON_VALUE }),
  z.strictObject({ is: z.enum(['gt', 'gte', 'lt', 'lte']), to: z.number() }),
  z
    .strictObject({ is: z.literal('between'), min: z.number(), max: z.number() })
    .refine((range) => range.min <= range.max, { message: 'min must not exceed max' }),
  z.strictObject({ is: z.literal('in'), to: z.array(JSON_VALUE).min(1) }),
] as const;

export const SIGNAL_TEST = z.discriminatedUnion('is', [
  ...TEST_CASES,
  z.strictObject({ is: z.literal('changed') }),
]);
export type SignalTest = z.infer<typeof SIGNAL_TEST>;

export const SIGNAL_TIMING_WINDOW = z.strictObject({
  of: z.enum(SIGNAL_WINDOW_MODES),
  seconds: z.int().min(1).max(SIGNAL_LIMITS.windowSeconds),
});
export type SignalTimingWindow = z.infer<typeof SIGNAL_TIMING_WINDOW>;

const SECONDS = (longest: number): z.ZodOptional<z.ZodInt> =>
  z.int().min(0).max(longest).optional();

export const SIGNAL_TIMING_SHAPE = {
  test: SIGNAL_TEST.optional(),
  window: SIGNAL_TIMING_WINDOW.optional(),
  holdSeconds: SECONDS(SIGNAL_LIMITS.holdSeconds),
  debounceSeconds: SECONDS(SIGNAL_LIMITS.debounceSeconds),
  cooldownSeconds: SECONDS(SIGNAL_LIMITS.cooldownSeconds),
  silentSeconds: SECONDS(SIGNAL_LIMITS.silentSeconds),
  first: z.enum(SIGNAL_FIRST_PERIODS).optional(),
  rearm: z.number().optional(),
} as const;

function testHolds(
  test: Exclude<SignalTest, { is: 'changed' }>,
  value: JsonValue | undefined,
): boolean {
  switch (test.is) {
    case 'in':
      return value !== undefined && test.to.some((entry) => jsonEquals(value, entry));
    case 'between':
      return compare({ operator: 'between', min: test.min, max: test.max }, value, undefined);
    case 'eq':
    case 'ne':
      return compare({ operator: test.is, value: test.to }, value, undefined);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compare({ operator: test.is, value: test.to }, value, undefined);
  }
}

export function triggerTestHolds(
  test: SignalTest | undefined,
  value: JsonValue,
  previous: JsonValue | undefined,
): boolean {
  if (test === undefined) return true;
  if (test.is === 'changed') return previous !== undefined && !jsonEquals(value, previous);
  return testHolds(test, value);
}

export type DirectionalTest = Extract<SignalTest, { is: 'gt' | 'gte' | 'lt' | 'lte' }>;

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MONDAY_OFFSET = 6;

export function directionalTest(test: SignalTest | undefined): DirectionalTest | null {
  return test !== undefined &&
    (test.is === 'gt' || test.is === 'gte' || test.is === 'lt' || test.is === 'lte')
    ? test
    : null;
}

function risesAbove(test: DirectionalTest): boolean {
  return test.is === 'gt' || test.is === 'gte';
}

export function rearmReached(test: DirectionalTest, rearm: number, value: number): boolean {
  return risesAbove(test) ? value < rearm : value > rearm;
}

export interface SignalOptions {
  readonly test?: SignalTest | undefined;
  readonly window?: unknown;
  readonly holdSeconds?: number | undefined;
  readonly debounceSeconds?: number | undefined;
  readonly silentSeconds?: number | undefined;
  readonly first?: SignalFirstPeriod | undefined;
  readonly rearm?: number | undefined;
}

function silenceError(trigger: SignalOptions): string | null {
  const clashes = [
    trigger.test,
    trigger.window,
    trigger.holdSeconds,
    trigger.debounceSeconds,
    trigger.first,
    trigger.rearm,
  ];
  return clashes.some((option) => option !== undefined)
    ? 'A silence trigger takes only silentSeconds and cooldownSeconds'
    : null;
}

export function signalOptionsError(trigger: SignalOptions): string | null {
  if (trigger.silentSeconds !== undefined) return silenceError(trigger);
  if (trigger.rearm === undefined) return null;
  const test = directionalTest(trigger.test);
  if (test === null) return 'rearm needs a gt, gte, lt or lte test';
  const apart = risesAbove(test) ? trigger.rearm < test.to : trigger.rearm > test.to;
  return apart ? null : 'rearm must lie on the far side of the test value';
}

export function firstPeriodKey(period: SignalFirstPeriod, instant: Date, timeZone: string): string {
  if (period === 'ever') return 'ever';
  const clock = localClock(instant, timeZone);
  const back = period === 'week' ? (clock.weekday + MONDAY_OFFSET) % WEEK_DAYS : 0;
  const start = Date.UTC(clock.year, clock.month - 1, clock.day) - back * DAY_MS;
  return `${period}:${new Date(start).toISOString().slice(0, 10)}`;
}
