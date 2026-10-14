import {
  USAGE_BREAKDOWN_LIMIT,
  USAGE_CHOICES_LIMIT,
  USAGE_PART,
  type UsageChoices,
  USAGE_SUM,
  type UsageFilter,
  type UsageBucket,
  type UsagePart,
  type UsagePoint,
  type UsageSplit,
  type UsageSum,
  type UsageTotals,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Sql } from '../store/sql';
import { bucketSpans, type BucketSpan } from './buckets';
import { labelled, labelsOf } from './labels';
import { SPLIT_COLUMNS, whereOf } from './usage-filter';

const SLOT_SECONDS = 900;

export const UNKNOWN_COST_SQL =
  "(cost_state <> 'reconciled' and json_extract(meta, '$.cost_available') = 0)";
const UNKNOWN_SUM_SQL = `coalesce(sum(case when ${UNKNOWN_COST_SQL} then 1 else 0 end), 0) as unknown_count`;

const SUM_SQL = `count(*) as count,
  ${UNKNOWN_SUM_SQL},
  coalesce(sum(cost_micros), 0) as cost_micros,
  coalesce(sum(case when cost_state = 'estimated' then cost_micros else 0 end), 0) as pending_micros,
  coalesce(sum(tokens_in), 0) as tokens_in,
  coalesce(sum(tokens_out), 0) as tokens_out,
  coalesce(sum(tokens_cached), 0) as tokens_cached,
  coalesce(sum(tokens_reasoning), 0) as tokens_reasoning,
  coalesce(sum(audio_in_ms), 0) as audio_in_ms,
  coalesce(sum(audio_out_ms), 0) as audio_out_ms,
  coalesce(sum(images), 0) as images,
  coalesce(sum(video_ms), 0) as video_ms`;

const SLOT_ROW = z.strictObject({
  slot: z.int(),
  key: z.string().nullable(),
  count: z.int().min(0),
  unknown_count: z.int().min(0),
  cost_micros: z.int().min(0),
});

type SlotRow = z.output<typeof SLOT_ROW>;

export interface SeriesQuery {
  readonly filter: UsageFilter;
  readonly bucket: UsageBucket;
  readonly split: UsageSplit | null;
  readonly timeZone: string;
}

function sumOf(sql: Sql, filter: UsageFilter): UsageSum {
  const where = whereOf(filter);
  const sum = sql.get(
    USAGE_SUM,
    `select ${SUM_SQL} from ai_usage where ${where.text}`,
    where.parameters,
  );
  if (sum === undefined) {
    throw new Error('The usage sum query returned no row.');
  }
  return sum;
}

function partsOf(sql: Sql, filter: UsageFilter, split: UsageSplit, limit: number): UsagePart[] {
  const where = whereOf(filter);
  const column = SPLIT_COLUMNS[split];
  const parts = sql.all(
    USAGE_PART,
    `select ${column} as key, count(*) as count, ${UNKNOWN_SUM_SQL}, coalesce(sum(cost_micros), 0) as cost_micros
      from ai_usage where ${where.text} and ${column} is not null
      group by ${column} order by cost_micros desc, count desc limit $limit`,
    { ...where.parameters, limit },
  );
  return labelled(sql, split, parts);
}

export function totalsOf(sql: Sql, filter: UsageFilter): UsageTotals {
  const parts = (split: UsageSplit): UsagePart[] =>
    partsOf(sql, filter, split, USAGE_BREAKDOWN_LIMIT);
  return {
    from: filter.from,
    to: filter.to,
    sum: sumOf(sql, filter),
    by: {
      work: parts('work'),
      source: parts('source'),
      model: parts('model'),
      profile: parts('profile'),
      client: parts('client'),
      chat: parts('chat'),
      plugin: parts('plugin'),
    },
  };
}

function slotsOf(sql: Sql, filter: UsageFilter, split: UsageSplit | null): SlotRow[] {
  const where = whereOf(filter);
  const key = split === null ? 'null' : SPLIT_COLUMNS[split];
  return sql.all(
    SLOT_ROW,
    `select unixepoch(at) / ${String(SLOT_SECONDS)} as slot, ${key} as key,
      count(*) as count, ${UNKNOWN_SUM_SQL}, coalesce(sum(cost_micros), 0) as cost_micros
      from ai_usage where ${where.text} group by slot, key order by slot`,
    where.parameters,
  );
}

function partsOfSlots(slots: readonly SlotRow[]): UsagePart[] {
  const parts = new Map<string, UsagePart>();
  for (const slot of slots) {
    if (slot.key !== null) {
      const part = parts.get(slot.key);
      parts.set(slot.key, {
        key: slot.key,
        count: (part?.count ?? 0) + slot.count,
        unknown_count: (part?.unknown_count ?? 0) + slot.unknown_count,
        cost_micros: (part?.cost_micros ?? 0) + slot.cost_micros,
      });
    }
  }
  return [...parts.values()].sort((a, b) => b.cost_micros - a.cost_micros);
}

function pointOf(span: BucketSpan, slots: readonly SlotRow[]): UsagePoint {
  return {
    start: new Date(span.start).toISOString(),
    end: new Date(span.end).toISOString(),
    count: slots.reduce((total, slot) => total + slot.count, 0),
    unknown_count: slots.reduce((total, slot) => total + slot.unknown_count, 0),
    cost_micros: slots.reduce((total, slot) => total + slot.cost_micros, 0),
    parts: partsOfSlots(slots),
  };
}

export function seriesOf(sql: Sql, query: SeriesQuery): UsagePoint[] {
  const { filter } = query;
  const from = Date.parse(filter.from);
  const spans = bucketSpans(from, Date.parse(filter.to), query.bucket, query.timeZone);
  const grouped: SlotRow[][] = spans.map(() => []);
  let index = 0;
  for (const slot of slotsOf(sql, filter, query.split)) {
    const at = slot.slot * SLOT_SECONDS * 1000;
    while (index < spans.length - 1 && at >= (spans[index]?.end ?? at)) {
      index += 1;
    }
    grouped[index]?.push(slot);
  }
  const points = spans.map((span, position) => pointOf(span, grouped[position] ?? []));
  return query.split === null ? points : namedPoints(sql, query.split, points);
}

function namedPoints(sql: Sql, split: UsageSplit, points: readonly UsagePoint[]): UsagePoint[] {
  const label = labelsOf(
    sql,
    split,
    points.flatMap((point) => point.parts.map((part) => part.key)),
  );
  return points.map((point) => ({
    ...point,
    parts: point.parts.map((part) => ({ ...part, label: label(part.key) })),
  }));
}

const SPENT = z.strictObject({ spent: z.int().min(0) });

export function spentSince(sql: Sql, from: string): number {
  const row = sql.get(
    SPENT,
    'select coalesce(sum(cost_micros), 0) as spent from ai_usage where at >= $from',
    { from: new Date(from).toISOString() },
  );
  if (row === undefined) {
    throw new Error('The spend query returned no row.');
  }
  return row.spent;
}

export function choicesOf(sql: Sql, filter: UsageFilter): UsageChoices {
  const parts = (split: UsageSplit): UsagePart[] =>
    partsOf(sql, filter, split, USAGE_CHOICES_LIMIT);
  return {
    profile: parts('profile'),
    client: parts('client'),
    work: parts('work'),
    source: parts('source'),
    model: parts('model'),
    chat: parts('chat'),
    plugin: parts('plugin'),
  };
}

export function unknownSince(sql: Sql, from: string): number {
  const row = sql.get(
    z.strictObject({ unknown_count: z.int().nonnegative() }),
    `select ${UNKNOWN_SUM_SQL} from ai_usage where at >= $from`,
    { from: new Date(from).toISOString() },
  );
  if (row === undefined) throw new Error('The unavailable cost query returned no row.');
  return row.unknown_count;
}
