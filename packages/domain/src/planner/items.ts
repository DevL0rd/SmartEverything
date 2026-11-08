import { z } from 'zod';
import { TIME_ZONE } from '../automations';
import { JSON_VALUE } from '../values';
import { PLANNER_ATTACHMENT } from './attachments';
import { PLANNER_REMINDERS } from './collections';
import { PLANNER_COMPLETION } from './completion';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_LOCAL_DATE = z.iso.date();

export const PLANNER_LOCAL_DATETIME = z.iso.datetime({ local: true });

export const PLANNER_FREQUENCIES = [
  'YEARLY',
  'MONTHLY',
  'WEEKLY',
  'DAILY',
  'HOURLY',
  'MINUTELY',
  'SECONDLY',
] as const;

export const PLANNER_RRULE_WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const SIGNED = (limit: number): z.ZodInt =>
  z
    .int()
    .min(-limit)
    .max(limit)
    .refine((value) => value !== 0);

const RRULE_UNTIL = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('date'), value: PLANNER_LOCAL_DATE }),
  z.strictObject({
    kind: z.literal('datetime'),
    value: z.iso.datetime({ local: true, precision: 0 }),
    utc: z.boolean(),
  }),
]);

export const PLANNER_RRULE_PARTS = z
  .strictObject({
    freq: z.enum(PLANNER_FREQUENCIES),
    interval: z.int().positive(),
    count: z.int().positive().nullable(),
    until: RRULE_UNTIL.nullable(),
    by_day: z
      .array(
        z.strictObject({
          ordinal: SIGNED(53).nullable(),
          weekday: z.enum(PLANNER_RRULE_WEEKDAYS),
        }),
      )
      .readonly(),
    by_month_day: z.array(SIGNED(31)).readonly(),
    by_month: z.array(z.int().min(1).max(12)).readonly(),
    by_set_pos: z.array(SIGNED(366)).readonly(),
    by_year_day: z.array(SIGNED(366)).readonly(),
    by_week_no: z.array(SIGNED(53)).readonly(),
    by_hour: z.array(z.int().min(0).max(23)).readonly(),
    by_minute: z.array(z.int().min(0).max(59)).readonly(),
    by_second: z.array(z.int().min(0).max(60)).readonly(),
    week_start: z.enum(PLANNER_RRULE_WEEKDAYS).nullable(),
  })
  .readonly();

export type PlannerRrule = z.infer<typeof PLANNER_RRULE_PARTS>;

export type PlannerRruleResult =
  | { readonly success: true; readonly data: PlannerRrule }
  | { readonly success: false; readonly message: string };

function readInt(value: string): unknown {
  return /^[+-]?\d+$/.test(value) ? Number(value) : value;
}

function readInts(value: string): unknown {
  return value.split(',').map(readInt);
}

function readUntil(value: string): unknown {
  if (/^\d{8}$/.test(value))
    return { kind: 'date', value: value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') };
  if (!/^\d{8}T\d{6}Z?$/.test(value)) return value;
  return {
    kind: 'datetime',
    value: value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6'),
    utc: value.endsWith('Z'),
  };
}

function readByDay(value: string): unknown {
  return value.split(',').map((entry) => {
    const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(entry);
    if (match === null) return entry;
    return { ordinal: match[1] === undefined ? null : Number(match[1]), weekday: match[2] };
  });
}

const RRULE_KEYS: Readonly<
  Record<string, { readonly field: string; readonly read: (value: string) => unknown }>
> = {
  FREQ: { field: 'freq', read: (value) => value },
  INTERVAL: { field: 'interval', read: readInt },
  COUNT: { field: 'count', read: readInt },
  UNTIL: { field: 'until', read: readUntil },
  BYDAY: { field: 'by_day', read: readByDay },
  BYMONTHDAY: { field: 'by_month_day', read: readInts },
  BYMONTH: { field: 'by_month', read: readInts },
  BYSETPOS: { field: 'by_set_pos', read: readInts },
  BYYEARDAY: { field: 'by_year_day', read: readInts },
  BYWEEKNO: { field: 'by_week_no', read: readInts },
  BYHOUR: { field: 'by_hour', read: readInts },
  BYMINUTE: { field: 'by_minute', read: readInts },
  BYSECOND: { field: 'by_second', read: readInts },
  WKST: { field: 'week_start', read: (value) => value },
};

type RruleFields =
  { readonly fields: Record<string, unknown>; readonly error: null } | { readonly error: string };

function readRruleFields(text: string): RruleFields {
  const fields: Record<string, unknown> = {
    interval: 1,
    count: null,
    until: null,
    by_day: [],
    by_month_day: [],
    by_month: [],
    by_set_pos: [],
    by_year_day: [],
    by_week_no: [],
    by_hour: [],
    by_minute: [],
    by_second: [],
    week_start: null,
  };
  const seen = new Set<string>();
  for (const part of text.replace(/^RRULE:/i, '').split(';')) {
    const at = part.indexOf('=');
    const key = (at < 0 ? part : part.slice(0, at)).toUpperCase();
    const rule = RRULE_KEYS[key];
    if (rule === undefined || at < 0) return { error: `unknown or incomplete rule part "${part}"` };
    if (seen.has(key)) return { error: `${key} appears twice` };
    seen.add(key);
    fields[rule.field] = rule.read(part.slice(at + 1));
  }
  return { fields, error: null };
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function neverOccurs(parts: PlannerRrule): boolean {
  if (parts.by_month.length === 0 || parts.by_month_day.length === 0) return false;
  return !parts.by_month.some((month) =>
    parts.by_month_day.some((day) => Math.abs(day) <= (MONTH_DAYS[month - 1] ?? 0)),
  );
}

function hasOtherBy(parts: PlannerRrule): boolean {
  return [
    parts.by_day,
    parts.by_month_day,
    parts.by_month,
    parts.by_year_day,
    parts.by_week_no,
    parts.by_hour,
    parts.by_minute,
    parts.by_second,
  ].some((list) => list.length > 0);
}

const RRULE_RULES: readonly ((parts: PlannerRrule) => string | null)[] = [
  (p): string | null =>
    p.count !== null && p.until !== null ? 'COUNT and UNTIL exclude each other' : null,
  (p): string | null =>
    p.by_set_pos.length > 0 && !hasOtherBy(p) ? 'BYSETPOS needs another BY rule part' : null,
  (p): string | null =>
    p.by_week_no.length > 0 && p.freq !== 'YEARLY' ? 'BYWEEKNO needs FREQ=YEARLY' : null,
  (p): string | null =>
    p.by_year_day.length > 0 && ['DAILY', 'WEEKLY', 'MONTHLY'].includes(p.freq)
      ? `BYYEARDAY does not combine with FREQ=${p.freq}`
      : null,
  (p): string | null =>
    p.by_month_day.length > 0 && p.freq === 'WEEKLY'
      ? 'BYMONTHDAY does not combine with WEEKLY'
      : null,
  (p): string | null =>
    p.by_day.some((day) => day.ordinal !== null) &&
    (!['MONTHLY', 'YEARLY'].includes(p.freq) || (p.freq === 'YEARLY' && p.by_week_no.length > 0))
      ? 'a numbered BYDAY needs FREQ=MONTHLY or FREQ=YEARLY without BYWEEKNO'
      : null,
  (p): string | null => (neverOccurs(p) ? 'the rule never occurs: no month has those days' : null),
];

export function parsePlannerRrule(text: string): PlannerRruleResult {
  const read = readRruleFields(text);
  if (read.error !== null) return { success: false, message: read.error };
  const parsed = PLANNER_RRULE_PARTS.safeParse(read.fields);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { success: false, message };
  }
  for (const rule of RRULE_RULES) {
    const message = rule(parsed.data);
    if (message !== null) return { success: false, message };
  }
  return { success: true, data: parsed.data };
}

function plannerRruleIssue(text: string, allDay: boolean): string | null {
  const result = parsePlannerRrule(text);
  if (!result.success) return result.message;
  const until = result.data.until;
  if (until !== null && (until.kind === 'date') !== allDay) {
    return 'UNTIL has the same value type as the start';
  }
  return null;
}

export const PLANNER_ITEM_KINDS = ['task', 'event'] as const;

export const PLANNER_ITEM_STATUSES = ['open', 'done', 'cancelled', 'proposed'] as const;

export const PLANNER_ITEM_CREATORS = ['person', 'ai', 'google', 'automation'] as const;

export const PLANNER_GOOGLE_STATES = ['synced', 'sending', 'conflict'] as const;

export const PLANNER_ITEM_GOOGLE = z
  .strictObject({
    id: z.string().min(1).nullable(),
    calendarOrListId: z.string().min(1),
    etag: z.string().min(1).nullable(),
    base: z.record(z.string(), JSON_VALUE).readonly(),
    state: z.enum(PLANNER_GOOGLE_STATES),
  })
  .readonly();

export type PlannerItemGoogle = z.infer<typeof PLANNER_ITEM_GOOGLE>;

const ITEM_SHAPE = z.strictObject({
  id: ID,
  profile_id: ID,
  collection_id: ID,
  kind: z.enum(PLANNER_ITEM_KINDS),
  parent_id: ID.nullable(),
  title: z.string().trim().min(1),
  notes: z.string(),
  location: z.string().trim().min(1).nullable(),
  priority: z.int().min(1).max(3).nullable(),
  tags: z.array(z.string().trim().min(1)).readonly(),
  estimate_minutes: z.int().positive().nullable(),
  start_local: z.union([PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME]).nullable(),
  end_local: z.union([PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME]).nullable(),
  time_zone: TIME_ZONE.nullable(),
  all_day: z.boolean(),
  due_date: PLANNER_LOCAL_DATE.nullable(),
  due_at: MOMENT.nullable(),
  rrule: z.string().trim().min(1).nullable(),
  exdates: z.array(z.union([PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME])).readonly(),
  series_id: ID.nullable(),
  original_start: z.union([PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME]).nullable(),
  start: MOMENT.nullable(),
  end: MOMENT.nullable(),
  series_end: MOMENT.nullable(),
  status: z.enum(PLANNER_ITEM_STATUSES),
  position: z.number(),
  completion: PLANNER_COMPLETION,
  attachments: z.array(PLANNER_ATTACHMENT).readonly(),
  reminders: PLANNER_REMINDERS,
  google: PLANNER_ITEM_GOOGLE.nullable(),
  created_by: z.enum(PLANNER_ITEM_CREATORS),
  created_at: MOMENT,
  updated_at: MOMENT,
  deleted_at: MOMENT.nullable(),
});

type ItemShape = z.infer<typeof ITEM_SHAPE>;

function flag(context: z.RefinementCtx, path: string, message: string): void {
  context.addIssue({ code: 'custom', path: [path], message });
}

function matchesStartType(value: string, allDay: boolean): boolean {
  const schema = allDay ? PLANNER_LOCAL_DATE : PLANNER_LOCAL_DATETIME;
  return schema.safeParse(value).success;
}

function wholeSeconds(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

function startedIssues(row: ItemShape, start: string, context: z.RefinementCtx): void {
  const { end_local: end } = row;
  if (!matchesStartType(start, row.all_day)) {
    flag(
      context,
      'start_local',
      'the start is a date for an all-day item and a local date-time otherwise',
    );
  }
  if (row.all_day === (row.time_zone !== null)) {
    flag(context, 'time_zone', 'an all-day item has no zone and a timed item has an IANA zone');
  }
  if (end === null) return;
  if (!matchesStartType(end, row.all_day)) {
    flag(context, 'end_local', 'the end has the same value type as the start');
  } else if (wholeSeconds(end) < wholeSeconds(start)) {
    flag(context, 'end_local', 'the end is not before the start');
  }
}

function timingIssues(row: ItemShape, context: z.RefinementCtx): void {
  if (row.start_local !== null) {
    startedIssues(row, row.start_local, context);
    return;
  }
  if (row.kind === 'event') flag(context, 'start_local', 'an event has a start');
  for (const key of ['end_local', 'start', 'end'] as const) {
    if (row[key] !== null) flag(context, key, 'only an item with a start has an end');
  }
}

function dueIssues(row: ItemShape, context: z.RefinementCtx): void {
  if (row.kind === 'event' && (row.due_date !== null || row.due_at !== null)) {
    flag(context, 'due_date', 'only a task is due');
  }
  if (row.parent_id === row.id) flag(context, 'parent_id', 'an item is not its own parent');
}

function overrideIssues(row: ItemShape, context: z.RefinementCtx): void {
  if ((row.series_id === null) !== (row.original_start === null)) {
    flag(context, 'original_start', 'series_id and original_start are set together');
  }
  if (row.series_id !== null && (row.series_id === row.id || row.rrule !== null)) {
    flag(context, 'series_id', 'a changed occurrence belongs to another item and does not repeat');
  }
  if (row.original_start !== null && !matchesStartType(row.original_start, row.all_day)) {
    flag(context, 'original_start', 'original_start has the same value type as the start');
  }
}

function recurrenceIssues(row: ItemShape, context: z.RefinementCtx): void {
  if (row.rrule === null) {
    if (row.exdates.length > 0) flag(context, 'exdates', 'excluded dates need a repeat rule');
    if (row.series_end !== null)
      flag(context, 'series_end', 'only a repeating item has a series end');
    return;
  }
  if (row.start_local === null) flag(context, 'rrule', 'a repeating item has a start');
  const message = plannerRruleIssue(row.rrule, row.all_day);
  if (message !== null) flag(context, 'rrule', message);
  if (row.exdates.some((value) => !matchesStartType(value, row.all_day))) {
    flag(context, 'exdates', 'excluded dates have the same value type as the start');
  }
}

export const PLANNER_ITEM_ROW = ITEM_SHAPE.superRefine((row, context) => {
  timingIssues(row, context);
  dueIssues(row, context);
  overrideIssues(row, context);
  recurrenceIssues(row, context);
}).readonly();

export type PlannerItemRow = z.infer<typeof PLANNER_ITEM_ROW>;
