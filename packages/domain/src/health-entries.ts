import { z } from 'zod';
import {
  HEALTH_RECORD,
  HEALTH_RECORD_TYPE,
  type HealthRecord,
  type HealthRecordType,
} from './health';

export const LOGGABLE_TYPES = [
  'Weight',
  'Height',
  'BodyFat',
  'BloodPressure',
  'BloodGlucose',
  'BodyTemperature',
  'BasalBodyTemperature',
  'OxygenSaturation',
  'RestingHeartRate',
  'RespiratoryRate',
  'Hydration',
  'Nutrition',
  'ExerciseSession',
  'SleepSession',
  'MindfulnessSession',
  'MenstruationFlow',
  'MenstruationPeriod',
  'IntermenstrualBleeding',
  'CervicalMucus',
  'OvulationTest',
  'SexualActivity',
] as const satisfies readonly HealthRecordType[];

export type LoggableType = (typeof LOGGABLE_TYPES)[number];

export const LOGGABLE_TYPE = z.enum(LOGGABLE_TYPES);

const INTERVAL_TYPES: ReadonlySet<LoggableType> = new Set([
  'Hydration',
  'Nutrition',
  'ExerciseSession',
  'SleepSession',
  'MindfulnessSession',
  'MenstruationPeriod',
]);

export function isIntervalEntry(type: LoggableType): boolean {
  return INTERVAL_TYPES.has(type);
}

export function isLoggable(type: HealthRecordType): type is LoggableType {
  return LOGGABLE_TYPES.some((loggable) => loggable === type);
}

export const ENTRIES_SOURCE_APP = 'smarteverything.entries';

export const OWN_SOURCE_PREFIX = 'smarteverything.';

export function isOwnSource(sourceApp: string): boolean {
  return sourceApp.startsWith(OWN_SOURCE_PREFIX);
}

export const MEAL_TYPES = { unknown: 0, breakfast: 1, lunch: 2, dinner: 3, snack: 4 } as const;

export type MealType = keyof typeof MEAL_TYPES;

export const MEALS: readonly Exclude<MealType, 'unknown'>[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

export const PORTION_UNITS = ['g', 'ml'] as const;

export type PortionUnit = (typeof PORTION_UNITS)[number];

const MOMENT = z.iso.datetime({ offset: true });
const ZONE_OFFSET = z.int().min(-64_800).max(64_800).nullable();
const ID = z.uuid();

const LEGACY_MULTIPLIER = z.number().min(0.1).max(20);

const LARGEST_PORTION = 10_000 * 20;

export const FOOD_PORTION = z.strictObject({
  foodId: ID.nullable(),
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(LARGEST_PORTION),
  unit: z.enum(PORTION_UNITS),
  label: z.string().trim().max(60),
  waterMl: z.number().min(0).max(LARGEST_PORTION),
  multiplier: LEGACY_MULTIPLIER.optional(),
});

export type FoodPortion = z.infer<typeof FOOD_PORTION>;

const ENTRY_DATA = z.record(z.string(), z.unknown());

const ENTRY_FIELDS = {
  type: LOGGABLE_TYPE,
  startTime: MOMENT,
  endTime: MOMENT.nullable(),
  zoneOffsetSeconds: ZONE_OFFSET,
  data: ENTRY_DATA,
  food: FOOD_PORTION.nullable(),
};

interface EntryShape {
  readonly id: string;
  readonly type: LoggableType;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly zoneOffsetSeconds: number | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly food: FoodPortion | null;
  readonly updatedAt: string;
}

function recordOf(entry: EntryShape, type: HealthRecordType, data: unknown): unknown {
  return {
    recordId: `entry:${entry.id}:${type}`,
    type,
    startTime: entry.startTime,
    endTime: entry.endTime,
    zoneOffsetSeconds: entry.zoneOffsetSeconds,
    sourceApp: ENTRIES_SOURCE_APP,
    lastModified: entry.updatedAt,
    data,
  };
}

const PROBE_ID = '00000000-0000-4000-8000-000000000000';

export const HEALTH_ENTRY_INPUT = z.strictObject(ENTRY_FIELDS).transform((input, context) => {
  if (input.food !== null && input.type !== 'Nutrition') {
    context.addIssue({
      code: 'custom',
      message: 'only food entries carry a portion',
      path: ['food'],
    });
  }
  const probe = HEALTH_RECORD.safeParse(
    recordOf({ ...input, id: PROBE_ID, updatedAt: input.startTime }, input.type, input.data),
  );
  if (!probe.success) {
    for (const issue of probe.error.issues) {
      context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
    return z.NEVER;
  }
  const kept: Record<string, unknown> = probe.data.data;
  for (const key of Object.keys(input.data).filter((name) => !(name in kept))) {
    context.addIssue({ code: 'custom', message: 'unknown field', path: ['data', key] });
  }
  return { ...input, data: kept };
});

export type HealthEntryInput = z.infer<typeof HEALTH_ENTRY_INPUT>;

export const HEALTH_ENTRY_ROW = z.strictObject({
  id: ID,
  profile_id: ID,
  record_type: LOGGABLE_TYPE,
  start_time: MOMENT,
  end_time: MOMENT.nullable(),
  zone_offset_seconds: ZONE_OFFSET,
  data: ENTRY_DATA,
  food: FOOD_PORTION.nullable(),
  version: z.int().min(1),
  save_error: z.string().nullable().default(null),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type HealthEntryRow = z.infer<typeof HEALTH_ENTRY_ROW>;

function shapeOf(row: HealthEntryRow): EntryShape {
  return {
    id: row.id,
    type: row.record_type,
    startTime: row.start_time,
    endTime: row.end_time,
    zoneOffsetSeconds: row.zone_offset_seconds,
    data: row.data,
    food: row.food,
    updatedAt: row.updated_at,
  };
}

export function entryRecord(row: HealthEntryRow): HealthRecord {
  const entry = shapeOf(row);
  return HEALTH_RECORD.parse(recordOf(entry, entry.type, entry.data));
}

export function entryRecords(row: HealthEntryRow): HealthRecord[] {
  const entry = shapeOf(row);
  const main = entryRecord(row);
  const water = entry.food?.waterMl ?? 0;
  return water > 0
    ? [main, HEALTH_RECORD.parse(recordOf(entry, 'Hydration', { liters: water / 1000 }))]
    : [main];
}

export interface EntryRecordRef {
  readonly type: HealthRecordType;
  readonly recordId: string;
}

export function entryRecordRefs(row: Pick<HealthEntryRow, 'id' | 'record_type'>): EntryRecordRef[] {
  const main = { type: row.record_type, recordId: `entry:${row.id}:${row.record_type}` };
  return row.record_type === 'Nutrition'
    ? [main, { type: 'Hydration', recordId: `entry:${row.id}:Hydration` }]
    : [main];
}

export function clientRecordIdOf(recordId: string): string {
  return `se-${recordId.replaceAll(':', '-')}`;
}

export const CLIENT_RECORD_ID = z
  .string()
  .regex(/^se-entry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z]+$/);

export function entryRefOfClientRecordId(
  clientRecordId: string,
): EntryRecordRef & { readonly entryId: string } {
  const valid = CLIENT_RECORD_ID.parse(clientRecordId);
  const entryId = valid.slice(9, 45);
  const type = HEALTH_RECORD_TYPE.parse(valid.slice(46));
  return { entryId, type, recordId: `entry:${entryId}:${type}` };
}

export function entryIdOfRecord(recordId: string): string | null {
  const match = /^entry:([0-9a-f-]{36}):/.exec(recordId);
  return match?.[1] ?? null;
}

const OUTBOX_RECORD = z.strictObject({
  type: z.string().min(1),
  clientRecordId: z.string().min(1).max(200),
  record: HEALTH_RECORD.nullable(),
});

export const OUTBOX_ENTRY = z.strictObject({
  id: ID,
  version: z.int().min(1),
  records: z.array(OUTBOX_RECORD).min(1),
});

export type OutboxEntry = z.infer<typeof OUTBOX_ENTRY>;
