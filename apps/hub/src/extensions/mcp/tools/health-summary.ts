import { HEALTH_METRICS, localClock } from '@smarteverything/domain';
import { z } from 'zod';
import type { Caller } from '../../../server/auth';
import type { Store } from '../../../store/store';
import { callerFor, profileFor } from './acting';
import { PERSON, READS, defineTool, type Tool, type ToolContext } from './registry';
import { DAY_MS } from '../../../metrics/minute';

const HEALTH_DAYS = 366;
const DAY = z.iso.date('must be a day written YYYY-MM-DD, such as 2026-10-10');

const RANGE_FIELDS = {
  from: DAY.describe('First day, YYYY-MM-DD'),
  to: DAY.describe('Last day, YYYY-MM-DD'),
  metrics: z
    .array(z.enum(HEALTH_METRICS))
    .min(1)
    .optional()
    .describe(
      'Only these daily metrics, such as steps, sleep, protein or hydration; energy_in is the calories eaten, active_energy and total_energy the calories burned',
    ),
  records: z
    .boolean()
    .default(true)
    .describe(
      'Also list single records without a daily figure: meals and drinks with their nutrients, ' +
        'blood pressure, glucose, temperature, body composition, mindfulness and cycle tracking',
    ),
};

function checkedRange<T extends { from: string; to: string }>(schema: z.ZodType<T>): z.ZodType<T> {
  return schema
    .refine((range) => range.from <= range.to, { message: 'from must not be after to' })
    .refine((range) => Date.parse(range.to) - Date.parse(range.from) < HEALTH_DAYS * DAY_MS, {
      message: `the range must not exceed ${String(HEALTH_DAYS)} days`,
    });
}

const HEALTH_RANGE = checkedRange(z.strictObject(RANGE_FIELDS));

const SUMMARY_INPUT = z.strictObject({
  ...RANGE_FIELDS,
  from: DAY.optional().describe('First day, YYYY-MM-DD; today when left out'),
  to: DAY.optional().describe('Last day, YYYY-MM-DD; the first day when left out'),
  personId: PERSON,
});

export type HealthRange = z.infer<typeof HEALTH_RANGE>;

export function healthSummary(
  store: Pick<Store, 'host'>,
  caller: Caller,
  input: HealthRange,
  onlyProfileId?: string,
): Promise<Record<string, unknown>> {
  return store.host.read('mcpHealthSummary', {
    caller,
    input,
    onlyProfileId: onlyProfileId ?? null,
  });
}

function today(context: ToolContext): string {
  const clock = localClock(context.clock.now(), context.store.live.home.settings.read().time_zone);
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${String(clock.year)}-${two(clock.month)}-${two(clock.day)}`;
}

export const HEALTH_SUMMARY_TOOL: Tool = defineTool({
  name: 'get_health_summary',
  input: SUMMARY_INPUT,
  annotations: READS,
  run: async (context, input) => {
    const from = input.from ?? input.to ?? today(context);
    const { personId, ...rest } = input;
    const range = HEALTH_RANGE.parse({ ...rest, from, to: input.to ?? from });
    return {
      structured: await healthSummary(
        context.store,
        await callerFor(context),
        range,
        personId === undefined ? undefined : await profileFor(context, { personId }),
      ),
    };
  },
});
