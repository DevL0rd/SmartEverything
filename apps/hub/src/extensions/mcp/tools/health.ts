import {
  API_ENDPOINTS as E,
  FITNESS_SETTINGS_CHANGE,
  HEALTH_METRICS,
  HEALTH_METRIC_UNITS,
  HEALTH_RECORD_TYPES,
  HEALTH_TYPE_INFO,
  LOGGABLE_TYPE,
  NUTRITION_PREF,
  type HealthRecord,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate, profileFor, type ActingAs } from './acting';
import { readPref, writePref } from './prefs';
import {
  MOMENT_ARGUMENT,
  PROFILE,
  READS,
  WRITES,
  defineTool,
  jsonSchemaOf,
  type Tool,
  type ToolContext,
} from './registry';
import { entrySpan } from './spans';

const DAY_MS = 86_400_000;

const LATEST = z.strictObject({
  types: z
    .array(z.enum(HEALTH_RECORD_TYPES))
    .min(1)
    .optional()
    .describe('Record types; every type when left out'),
  metrics: z
    .array(z.enum(HEALTH_METRICS))
    .min(1)
    .optional()
    .describe('Daily metrics; every metric when left out'),
  withinDays: z.int().min(1).max(3650).default(30).describe('How far back to look'),
  profileId: PROFILE,
});

type Latest = z.infer<typeof LATEST>;

function newestByType(records: readonly HealthRecord[]): HealthRecord[] {
  const newest = new Map<string, HealthRecord>();
  for (const record of records) {
    const seen = newest.get(record.type);
    if (seen === undefined || record.startTime > seen.startTime) {
      newest.set(record.type, record);
    }
  }
  return [...newest.values()];
}

async function latest(context: ToolContext, input: Latest): Promise<Record<string, unknown>> {
  const now = context.clock.now();
  const from = new Date(now.getTime() - input.withinDays * DAY_MS);
  const records = E.readHealthRecords.response.parse(
    await operate(
      context,
      'readHealthRecords',
      {
        query: {
          types: input.types ?? HEALTH_RECORD_TYPES,
          from: from.toISOString(),
          to: now.toISOString(),
        },
      },
      input,
    ),
  );
  const daily = E.readHealthDaily.response.parse(
    await operate(
      context,
      'readHealthDaily',
      {
        query: {
          from: from.toISOString().slice(0, 10),
          to: new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10),
          metrics: input.metrics ?? HEALTH_METRICS,
        },
      },
      input,
    ),
  );
  const lastDay = new Map(daily.map((row) => [row.metric, row]));
  return {
    records: newestByType(records).map((record) => ({
      type: record.type,
      start: record.startTime,
      end: record.endTime,
      source: record.sourceApp,
      data: record.data,
    })),
    daily: [...lastDay.values()],
  };
}

const LOG = z.strictObject({
  type: LOGGABLE_TYPE,
  startTime: MOMENT_ARGUMENT.optional().describe(
    'When it was measured or began; now when left out',
  ),
  endTime: MOMENT_ARGUMENT.optional().describe('When a session ended; required for sessions'),
  data: z
    .record(z.string(), z.unknown())
    .describe('The record data, shaped as read_health view types gives for the type'),
  profileId: PROFILE,
});

type Log = z.infer<typeof LOG>;

async function logged(context: ToolContext, input: Log): Promise<unknown> {
  const start = input.startTime === undefined ? context.clock.now() : new Date(input.startTime);
  const span = entrySpan(context, input.type, start, input.endTime);
  return operate(
    context,
    'createHealthEntry',
    { body: { type: input.type, ...span, data: input.data, food: null } },
    input,
  );
}

const GOALS = z.strictObject({
  fitness: FITNESS_SETTINGS_CHANGE.optional().describe('Daily goals and maximum heart rate'),
  nutrition: NUTRITION_PREF.partial().optional().describe('Nutrition goals and glass size'),
  profileId: PROFILE,
});

async function goalsSet(
  context: ToolContext,
  input: z.infer<typeof GOALS>,
): Promise<Record<string, unknown>> {
  const as: ActingAs = input;
  if (input.fitness !== undefined) {
    await operate(context, 'updateFitnessSettings', { body: input.fitness }, as);
  }
  return {
    person: context.store.profiles.byId(profileFor(context, as)),
    nutrition:
      input.nutrition === undefined
        ? await readPref(context, 'nutrition', as)
        : await writePref(context, 'nutrition', input.nutrition, as),
  };
}

export const HEALTH_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'get_health_latest',
    input: LATEST,
    annotations: READS,
    run: async (context, input) => ({ structured: await latest(context, input) }),
  }),
  defineTool({
    name: 'list_health_types',
    input: z.strictObject({}),
    annotations: READS,
    run: () => ({
      structured: {
        records: HEALTH_TYPE_INFO.map((info) => ({
          type: info.type,
          loggable: info.loggable,
          span: info.span,
          end_required: info.endRequired,
          data: jsonSchemaOf(info.data, 'input'),
        })),
        daily_metrics: HEALTH_METRICS.map((metric) => ({
          metric,
          unit: HEALTH_METRIC_UNITS[metric],
        })),
      },
    }),
  }),
  defineTool({
    name: 'log_health',
    input: LOG,
    annotations: WRITES,
    run: async (context, input) => ({ structured: { entry: await logged(context, input) } }),
  }),
  defineTool({
    name: 'set_goals',
    input: GOALS,
    annotations: { ...WRITES, idempotentHint: true },
    run: async (context, input) => ({ structured: await goalsSet(context, input) }),
  }),
];
