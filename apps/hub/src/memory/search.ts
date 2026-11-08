import type { AiMemoryKind } from '@smarteverything/domain';

export const MIN_SIMILARITY = 0.3;
export const DUPLICATE_SIMILARITY = 0.93;
export const NEIGHBOUR_SIMILARITY = 0.8;
export const RELEVANT_SIMILARITY = 0.35;
export const RELEVANT_COUNT = 8;
export const DEFAULT_PROMPT_CHARS = 3000;
export const RECENT_COUNT = 5;
export const WINDOW_COUNT = 5;
export const MANAGER_NEIGHBOURS = 6;
export const DEDUPE_NEIGHBOURS = 5;

const DAY_MS = 86_400_000;

const HALF_LIFE_ANCHORS: readonly (readonly [number, number])[] = [
  [0, 14],
  [25, 45],
  [50, 120],
  [75, 365],
];

export const NEVER_FADES = 90;

export const PURGE_BELOW = 40;

const RETENTION_STEPS_DAYS = [7, 12, 21, 37, 65, 115, 205, 365] as const;

export const FADE_LINE = 15;

function halfLifeDays(importance: number): number {
  const index = Math.min(HALF_LIFE_ANCHORS.length - 2, Math.floor(importance / 25));
  const [fromScore, fromDays] = HALF_LIFE_ANCHORS[index] ?? [0, 14];
  const [toScore, toDays] = HALF_LIFE_ANCHORS[index + 1] ?? [25, 45];
  return fromDays + ((importance - fromScore) / (toScore - fromScore)) * (toDays - fromDays);
}

export interface Fading {
  readonly kind: AiMemoryKind;
  readonly importance: number;
  readonly updated_at: string;
  readonly recalled_at: string | null;
  readonly recall_count: number;
  readonly valid_until: string | null;
}

export function lastTouched(memory: Pick<Fading, 'updated_at' | 'recalled_at'>): number {
  return Math.max(
    Date.parse(memory.updated_at),
    memory.recalled_at === null ? 0 : Date.parse(memory.recalled_at),
  );
}

export function retentionDays(importance: number): number {
  const step = Math.min(Math.floor(importance / 5), RETENTION_STEPS_DAYS.length - 1);
  return RETENTION_STEPS_DAYS[step] ?? 365;
}

export function purgeable(
  memory: Pick<Fading, 'kind' | 'importance' | 'updated_at' | 'recalled_at'>,
  now: Date,
): boolean {
  return (
    memory.kind !== 'vocabulary' &&
    memory.importance < PURGE_BELOW &&
    (now.getTime() - lastTouched(memory)) / DAY_MS > retentionDays(memory.importance)
  );
}

export function strength(memory: Fading, now: Date): number {
  if (memory.kind === 'vocabulary' || memory.importance >= NEVER_FADES) return memory.importance;
  const age = Math.max(0, (now.getTime() - lastTouched(memory)) / DAY_MS);
  const halfLife = halfLifeDays(memory.importance) * (1 + memory.recall_count);
  return memory.importance * 0.5 ** (age / halfLife);
}

export function expired(memory: Pick<Fading, 'valid_until'>, day: string): boolean {
  return memory.valid_until !== null && memory.valid_until < day;
}

export function faded(memory: Fading, now: Date, day: string): boolean {
  return (
    expired(memory, day) || (memory.kind !== 'vocabulary' && strength(memory, now) < FADE_LINE)
  );
}

export interface Searchable {
  readonly id: string;
  readonly text: string;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export function keywordMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '')
    .every((word) => lower.includes(word));
}

export function rankerAbove(
  minimum: number,
): <T extends Searchable>(
  items: readonly T[],
  query: string,
  queryVector: Float32Array | null,
  vectors: ReadonlyMap<string, Float32Array>,
) => T[] {
  return (items, query, queryVector, vectors) => {
    const scored: { item: (typeof items)[number]; score: number }[] = [];
    for (const item of items) {
      const vector = vectors.get(item.id);
      const similarity =
        queryVector === null || vector === undefined ? 0 : cosine(queryVector, vector);
      const exact = keywordMatch(item.text, query);
      if (!exact && similarity < minimum) continue;
      scored.push({ item, score: similarity + (exact ? 1 : 0) });
    }
    return scored.toSorted((a, b) => b.score - a.score).map((entry) => entry.item);
  };
}

export const rank = rankerAbove(MIN_SIMILARITY);

export const rankRelevant = rankerAbove(RELEVANT_SIMILARITY);

export const WINDOWS = [
  { name: 'today', days: 1 },
  { name: 'week', days: 7 },
  { name: 'month', days: 30 },
  { name: 'year', days: 365 },
] as const;

export type WindowName = (typeof WINDOWS)[number]['name'];

function dayFormatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function localDay(instant: Date, zone: string): string {
  return dayFormatter(zone).format(instant);
}

interface DatedMemory {
  readonly happened_on: string | null;
  readonly created_at: string;
}

interface MemoryCalendar {
  readonly day: string;
  readonly daysAgo: (memory: DatedMemory) => number;
}

export function memoryCalendar(now: Date, zone: string): MemoryCalendar {
  const formatter = dayFormatter(zone);
  const day = formatter.format(now);
  const today = Date.parse(day);
  return {
    day,
    daysAgo: (memory): number => {
      const date = memory.happened_on ?? formatter.format(new Date(memory.created_at));
      return Math.round((today - Date.parse(date)) / DAY_MS);
    },
  };
}
