import type {
  PlannerCollectionRow,
  PlannerOccurrenceView,
  PlannerSearchField,
  PlannerSearchHit,
  PlannerSearchPage,
} from '@smarteverything/domain';
import type { PlannerItemKind, PlannerSearchFilter, PlannerSearchWhen } from '../data/search';

export type HitGroupKey = 'upcoming' | 'past';

export interface HitGroup {
  readonly key: HitGroupKey;
  readonly title: string;
  readonly hits: readonly PlannerSearchHit[];
}

const GROUP_TITLE: Readonly<Record<HitGroupKey, string>> = {
  upcoming: 'Upcoming',
  past: 'Earlier',
};

export function hitKeyOf(hit: PlannerSearchHit): string {
  return `${hit.occurrence.item_id}:${hit.occurrence.occurrence_key}`;
}

export function hitsOf(
  pages: readonly PlannerSearchPage[] | undefined,
): readonly PlannerSearchHit[] {
  const seen = new Set<string>();
  return (pages ?? []).flatMap((page) =>
    page.hits.filter((hit) => {
      const key = hitKeyOf(hit);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

export function groupHits(hits: readonly PlannerSearchHit[]): readonly HitGroup[] {
  const groups: HitGroup[] = [];
  for (const key of ['upcoming', 'past'] as const) {
    const shown = hits.filter((hit) => (hit.reading === 'next') === (key === 'upcoming'));
    if (shown.length > 0) groups.push({ key, title: GROUP_TITLE[key], hits: shown });
  }
  return groups;
}

export interface HitTime {
  readonly at: number | null;
  readonly day: string | null;
  readonly overdue: boolean;
  readonly text: string;
}

export interface HitNow {
  readonly now: number;
  readonly today: string;
}

export interface HitFormat {
  readonly day: (moment: number) => string;
  readonly date: (day: string) => string;
  readonly time: (moment: number) => string;
}

function spanOf(occurrence: PlannerOccurrenceView, format: HitFormat): string {
  if (occurrence.start === null) return '';
  const start = Date.parse(occurrence.start);
  if (occurrence.all_day) return `${format.day(start)} · All day`;
  const end = occurrence.end === null ? null : Date.parse(occurrence.end);
  const time = end === null ? format.time(start) : `${format.time(start)}–${format.time(end)}`;
  return `${format.day(start)} · ${time}`;
}

function isOverdue(occurrence: PlannerOccurrenceView, clock: HitNow): boolean {
  if (occurrence.kind !== 'task') return false;
  if (occurrence.status === 'missed') return true;
  if (occurrence.status !== 'open') return false;
  if (occurrence.due_at !== null) return Date.parse(occurrence.due_at) < clock.now;
  return occurrence.due_date !== null && occurrence.due_date < clock.today;
}

function dueWord(overdue: boolean): string {
  return overdue ? 'Overdue ·' : 'Due';
}

export function hitTimeOf(
  occurrence: PlannerOccurrenceView,
  format: HitFormat,
  clock: HitNow,
): HitTime {
  if (occurrence.start !== null) {
    return {
      at: Date.parse(occurrence.start),
      day: null,
      overdue: false,
      text: spanOf(occurrence, format),
    };
  }
  const overdue = isOverdue(occurrence, clock);
  if (occurrence.due_at !== null) {
    const due = Date.parse(occurrence.due_at);
    return {
      at: due,
      day: null,
      overdue,
      text: `${dueWord(overdue)} ${format.day(due)} · ${format.time(due)}`,
    };
  }
  if (occurrence.due_date !== null) {
    return {
      at: null,
      day: occurrence.due_date,
      overdue,
      text: `${dueWord(overdue)} ${format.date(occurrence.due_date)}`,
    };
  }
  return {
    at: null,
    day: null,
    overdue: false,
    text: occurrence.kind === 'task' ? 'No date' : '',
  };
}

const FIELD_TEXT: Readonly<Record<PlannerSearchField, string>> = {
  title: 'title',
  notes: 'notes',
  location: 'place',
  guest: 'guests',
  calendar: 'calendar name',
};

export function matchedTextOf(matched: readonly PlannerSearchField[]): string | null {
  if (matched.includes('title')) return null;
  const fields = matched.map((field) => FIELD_TEXT[field]);
  return fields.length === 0 ? null : `Found in ${fields.join(' and ')}`;
}

export function calendarOf(
  collections: readonly PlannerCollectionRow[],
  id: string,
): PlannerCollectionRow | null {
  return collections.find((collection) => collection.id === id) ?? null;
}

export const KIND_CHOICES = ['all', 'event', 'task'] as const;

export type KindChoice = (typeof KIND_CHOICES)[number];

export function kindsOfChoice(choice: KindChoice): readonly PlannerItemKind[] | null {
  return choice === 'all' ? null : [choice];
}

export function choiceOfKinds(kinds: readonly PlannerItemKind[] | null): KindChoice {
  return kinds?.length === 1 ? (kinds[0] ?? 'all') : 'all';
}

export function toggledCollection(
  chosen: readonly string[] | null,
  id: string,
  all: readonly string[],
): readonly string[] | null {
  const current = chosen ?? all;
  const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
  return next.length === 0 || all.every((entry) => next.includes(entry)) ? null : next;
}

export function isCollectionChosen(chosen: readonly string[] | null, id: string): boolean {
  return chosen === null || chosen.includes(id);
}

export function calendarChipTextOf(
  chosen: readonly string[] | null,
  collections: readonly PlannerCollectionRow[],
): string {
  if (chosen === null) return 'All calendars';
  if (chosen.length === 1) return calendarOf(collections, chosen[0] ?? '')?.name ?? '1 calendar';
  return `${String(chosen.length)} calendars`;
}

export const WHEN_TEXT: Readonly<Record<PlannerSearchWhen, string>> = {
  all: 'Any time',
  upcoming: 'Upcoming',
  past: 'Past',
};

export function emptyFilter(text: string): PlannerSearchFilter {
  return { text, collections: null, kinds: null, when: 'all' };
}

export function filtered(filter: PlannerSearchFilter): boolean {
  return filter.collections !== null || filter.kinds !== null || filter.when !== 'all';
}

export function foundTextOf(count: number, more: boolean): string {
  const shown = more ? `${String(count)}+` : String(count);
  return `${shown} ${count === 1 && !more ? 'match' : 'matches'}`;
}

export function searchCollectionsOf(
  calendars: readonly PlannerCollectionRow[],
  own: readonly PlannerCollectionRow[],
): readonly PlannerCollectionRow[] {
  const ids = new Set(calendars.map((calendar) => calendar.id));
  return [...calendars, ...own.filter((row) => row.kind === 'list' && !ids.has(row.id))];
}
