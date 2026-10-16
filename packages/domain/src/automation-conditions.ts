import { AUTOMATION_INPUT } from './automation-bindings';
import { z } from 'zod';
import { AUTOMATION_VALUE_ID } from './automation-values';
import { CAPABILITY_KEY } from './capabilities';
import { VALUE_COMPARISON } from './comparison';
import { WEATHER_CONDITIONS } from './weather/rules';
export const CLOCK_TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time written as HH:MM');

export const WEEKDAYS = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .refine((days) => new Set(days).size === days.length, { message: 'weekdays must not repeat' });

export const LEGACY_CONDITION = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    deviceId: z.uuid(),
    capability: CAPABILITY_KEY,
    comparison: VALUE_COMPARISON,
  }),
  z
    .object({ type: z.literal('time_window'), after: CLOCK_TIME, before: CLOCK_TIME })
    .refine((window) => window.after !== window.before, {
      message: 'a time window must not start and end at the same time',
    }),
  z.object({ type: z.literal('weekday'), weekdays: WEEKDAYS }),
  ...WEATHER_CONDITIONS,
]);

export type LegacyCondition = z.infer<typeof LEGACY_CONDITION>;
export const CONDITION = z.union([
  LEGACY_CONDITION,
  z.strictObject({
    type: z.literal('binding'),
    input: AUTOMATION_INPUT,
    comparison: VALUE_COMPARISON,
  }),
  z.strictObject({
    type: z.literal('value'),
    valueId: AUTOMATION_VALUE_ID,
    comparison: VALUE_COMPARISON,
  }),
]);
export const LEGACY_CONDITIONS = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all'), items: z.array(LEGACY_CONDITION) }),
  z.object({ mode: z.literal('any'), items: z.array(LEGACY_CONDITION).min(1) }),
]);
export type Condition = z.infer<typeof CONDITION>;

export const CONDITIONS = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all'), items: z.array(CONDITION) }),
  z.object({ mode: z.literal('any'), items: z.array(CONDITION).min(1) }),
]);

export type Conditions = z.infer<typeof CONDITIONS>;
