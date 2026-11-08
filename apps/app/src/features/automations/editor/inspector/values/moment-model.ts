import type { JsonValue, PortEditorId } from '@smarteverything/domain';

const MOMENT_EDITORS = ['week-grid', 'date-list', 'kelvin'] as const;

export type MomentEditor = (typeof MOMENT_EDITORS)[number];

export function momentEditorOf(id: PortEditorId): MomentEditor | null {
  return MOMENT_EDITORS.find((editor) => editor === id) ?? null;
}

export interface WeekBlock {
  readonly at: string;
  readonly days: readonly number[];
  readonly rest: Readonly<Record<string, JsonValue>>;
}

export const WEEK_DAYS: readonly {
  readonly day: number;
  readonly short: string;
  readonly name: string;
}[] = [
  { day: 1, short: 'Mon', name: 'Monday' },
  { day: 2, short: 'Tue', name: 'Tuesday' },
  { day: 3, short: 'Wed', name: 'Wednesday' },
  { day: 4, short: 'Thu', name: 'Thursday' },
  { day: 5, short: 'Fri', name: 'Friday' },
  { day: 6, short: 'Sat', name: 'Saturday' },
  { day: 0, short: 'Sun', name: 'Sunday' },
];

const NEW_BLOCK_AT = '07:00';

function isRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function daysOf(value: JsonValue | undefined): readonly number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((day): day is number => typeof day === 'number');
}

function blockOf(value: JsonValue): WeekBlock {
  if (!isRecord(value)) return { at: NEW_BLOCK_AT, days: [], rest: {} };
  const { at, days, ...rest } = value;
  return { at: typeof at === 'string' ? at : NEW_BLOCK_AT, days: daysOf(days), rest };
}

export function weekBlocks(value: JsonValue | undefined): readonly WeekBlock[] {
  return Array.isArray(value) ? value.map(blockOf) : [];
}

export function storedBlocks(blocks: readonly WeekBlock[]): JsonValue {
  return blocks.map((block) => ({
    ...block.rest,
    at: block.at,
    ...(block.days.length === 0
      ? {}
      : { days: [...block.days].sort((left, right) => left - right) }),
  }));
}

export function newBlock(): WeekBlock {
  return { at: NEW_BLOCK_AT, days: [], rest: {} };
}

export function toggledDay(days: readonly number[], day: number): readonly number[] {
  return days.includes(day) ? days.filter((held) => held !== day) : [...days, day];
}

export function daysText(days: readonly number[]): string {
  if (days.length === 0 || days.length === WEEK_DAYS.length) return 'Every day';
  return WEEK_DAYS.filter((entry) => days.includes(entry.day))
    .map((entry) => entry.short)
    .join(', ');
}

export function dateList(value: JsonValue | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export function withDate(dates: readonly string[], date: string): readonly string[] {
  return [...new Set([...dates, date])].sort();
}

export function replacedDate(
  dates: readonly string[],
  index: number,
  date: string,
): readonly string[] {
  return withDate(
    dates.filter((_, at) => at !== index),
    date,
  );
}

export function withoutDate(dates: readonly string[], index: number): readonly string[] {
  return dates.filter((_, at) => at !== index);
}

export function nextFreeDay(dates: readonly string[], today: string): string {
  const last = dates.at(-1);
  if (last === undefined || last < today) return today;
  const next = new Date(`${last}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export type Warmth = 'Warm' | 'Neutral' | 'Cool';

const WARM_UP_TO = 3300;
const NEUTRAL_UP_TO = 4500;

export function warmthOf(kelvin: number): Warmth {
  if (kelvin <= WARM_UP_TO) return 'Warm';
  return kelvin <= NEUTRAL_UP_TO ? 'Neutral' : 'Cool';
}

export function kelvinRange(
  min: number | undefined,
  max: number | undefined,
): { readonly min: number; readonly max: number } | null {
  return min === undefined || max === undefined || max <= min ? null : { min, max };
}
