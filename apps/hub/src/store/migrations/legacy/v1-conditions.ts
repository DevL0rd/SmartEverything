import {
  AUTOMATION_INPUT,
  CLOCK_TIME,
  WEEKDAYS,
  AUTOMATION_VALUE_ID,
  CAPABILITY_KEY,
  VALUE_COMPARISON,
  WEATHER_CONDITIONS,
} from '@smarteverything/domain';
import { z } from 'zod';
const LEGACY_CONDITION = z.discriminatedUnion('type', [
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

const CONDITION = z.union([
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
export type Condition = z.infer<typeof CONDITION>;

export const CONDITIONS = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all'), items: z.array(CONDITION) }),
  z.object({ mode: z.literal('any'), items: z.array(CONDITION).min(1) }),
]);

export type Conditions = z.infer<typeof CONDITIONS>;
