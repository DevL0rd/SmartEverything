import {
  HEALTH_METRICS,
  localDayOf,
  type HealthRecord,
  type HealthRecordType,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { READS, defineTool, type Tool } from './registry';

const DAY_MS = 86_400_000;
const HEALTH_DAYS = 366;
const RECORDS_PER_PERSON = 300;

const RECORD_TYPES = [
  'Nutrition',
  'Hydration',
  'BloodPressure',
  'BloodGlucose',
  'BodyTemperature',
  'BasalBodyTemperature',
  'BodyFat',
  'LeanBodyMass',
  'BoneMass',
  'BodyWaterMass',
  'BasalMetabolicRate',
  'Height',
  'MindfulnessSession',
  'MenstruationFlow',
  'MenstruationPeriod',
  'OvulationTest',
  'CervicalMucus',
  'IntermenstrualBleeding',
  'SexualActivity',
] as const satisfies readonly HealthRecordType[];

const DAY = z.iso.date();

const HEALTH_RANGE = z
  .strictObject({
    from: DAY.describe('First day, YYYY-MM-DD'),
    to: DAY.describe('Last day, YYYY-MM-DD'),
    metrics: z
      .array(z.enum(HEALTH_METRICS))
      .min(1)
      .optional()
      .describe('Only these daily metrics, such as steps, sleep, energy_in, protein or hydration'),
    records: z
      .boolean()
      .default(true)
      .describe(
        'Also list single records without a daily figure: meals and drinks with their nutrients, ' +
          'blood pressure, glucose, temperature, body composition, mindfulness and cycle tracking',
      ),
  })
  .refine((range) => range.from <= range.to, { message: 'from must not be after to' })
  .refine((range) => Date.parse(range.to) - Date.parse(range.from) < HEALTH_DAYS * DAY_MS, {
    message: `the range must not exceed ${String(HEALTH_DAYS)} days`,
  });

type HealthRange = z.infer<typeof HEALTH_RANGE>;

function inRange(record: HealthRecord, range: HealthRange): boolean {
  const day = localDayOf(record);
  return day >= range.from && day <= range.to;
}

function recordsOf(store: Store, profileId: string, range: HealthRange): Record<string, unknown>[] {
  const window = {
    types: RECORD_TYPES,
    from: new Date(Date.parse(range.from) - DAY_MS).toISOString(),
    to: new Date(Date.parse(range.to) + 2 * DAY_MS).toISOString(),
  };
  return store.health
    .records(window, profileId)
    .filter((record) => inRange(record, range))
    .slice(-RECORDS_PER_PERSON)
    .map((record) => ({
      type: record.type,
      day: localDayOf(record),
      start: record.startTime,
      end: record.endTime,
      source: record.sourceApp,
      data: record.data,
    }));
}

function summary(store: Store, input: HealthRange): Record<string, unknown> {
  return {
    people: store.profiles.list().map((profile) => ({
      person: profile.name,
      days: store.health
        .dailyRange(profile.id, input.from, input.to, input.metrics ?? HEALTH_METRICS)
        .map((row) => ({ day: row.day, metric: row.metric, value: row.value, unit: row.unit })),
      ...(input.records ? { records: recordsOf(store, profile.id, input) } : {}),
    })),
  };
}

export const HEALTH_SUMMARY_TOOL: Tool = defineTool({
  name: 'get_health_summary',
  input: HEALTH_RANGE,
  annotations: READS,
  run: ({ store }, input) => ({ structured: summary(store, input) }),
});
