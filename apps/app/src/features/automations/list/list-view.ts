import { compareText } from '../../../format/text';
import { SECTION_ORDER, SECTION_TITLES, type ListEntry, type SectionId } from './list-entries';

export type SortId = 'name' | 'last-run' | 'most-runs' | 'edited';

export const SORTS: readonly { readonly id: SortId; readonly label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'last-run', label: 'Last run' },
  { id: 'most-runs', label: 'Most runs' },
  { id: 'edited', label: 'Recently edited' },
];

export type FilterId =
  'all' | 'on' | 'paused' | 'failing' | 'running' | 'assistant' | `room:${string}`;

export interface View {
  readonly filter: FilterId;
  readonly sort: SortId;
  readonly query: string;
}

export const DEFAULT_VIEW: View = { filter: 'all', sort: 'name', query: '' };
export const SEARCH_FROM = 8;

export interface Section {
  readonly id: SectionId;
  readonly title: string;
  readonly entries: readonly ListEntry[];
}

export function matchesFilter(entry: ListEntry, filter: FilterId): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'on':
      return entry.enabled;
    case 'paused':
      return !entry.enabled;
    case 'failing':
      return entry.lastError !== null;
    case 'running':
      return entry.stats.active > 0;
    case 'assistant':
      return entry.chips.includes('assistant');
    default:
      return entry.rooms.includes(filter.slice('room:'.length));
  }
}

function matchesQuery(entry: ListEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return (
    needle === '' ||
    entry.name.toLowerCase().includes(needle) ||
    (entry.sentence ?? '').toLowerCase().includes(needle)
  );
}

function byName(left: ListEntry, right: ListEntry): number {
  return compareText(left.name, right.name) || compareText(left.id, right.id);
}

const COMPARE: Readonly<Record<SortId, (left: ListEntry, right: ListEntry) => number>> = {
  name: byName,
  'last-run': (left, right) =>
    compareText(right.lastRunAt ?? '', left.lastRunAt ?? '') || byName(left, right),
  'most-runs': (left, right) => right.runCount - left.runCount || byName(left, right),
  edited: (left, right) => compareText(right.updatedAt, left.updatedAt) || byName(left, right),
};

export function sectionsOf(entries: readonly ListEntry[], view: View): readonly Section[] {
  const shown = entries
    .filter((entry) => matchesFilter(entry, view.filter) && matchesQuery(entry, view.query))
    .sort(COMPARE[view.sort]);
  return SECTION_ORDER.flatMap((id) => {
    const inSection = shown.filter((entry) => entry.section === id);
    return inSection.length === 0 ? [] : [{ id, title: SECTION_TITLES[id], entries: inSection }];
  });
}

export function countOf(sections: readonly Section[]): number {
  return sections.reduce((sum, section) => sum + section.entries.length, 0);
}

export interface FilterChoice {
  readonly id: FilterId;
  readonly label: string;
  readonly count: number;
}

export function filterChoices(
  entries: readonly ListEntry[],
  rooms: ReadonlyMap<string, string>,
): readonly FilterChoice[] {
  const fixed: readonly { readonly id: FilterId; readonly label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'on', label: 'On' },
    { id: 'paused', label: 'Paused' },
    { id: 'failing', label: 'Failing' },
    { id: 'running', label: 'Running' },
  ];
  const roomIds = [...new Set(entries.flatMap((entry) => entry.rooms))];
  const roomChoices = roomIds
    .map((id) => ({ id: `room:${id}` as const, label: rooms.get(id) ?? id }))
    .sort((left, right) => compareText(left.label, right.label));
  const assistant = entries.some((entry) => entry.chips.includes('assistant'))
    ? [{ id: 'assistant' as const, label: 'Made by the assistant' }]
    : [];
  return [...fixed, ...roomChoices, ...assistant].map((choice) => ({
    ...choice,
    count: entries.filter((entry) => matchesFilter(entry, choice.id)).length,
  }));
}

export function headerLine(entries: readonly ListEntry[]): string {
  const on = entries.filter((entry) => entry.enabled).length;
  const paused = entries.length - on;
  const attention = entries.filter((entry) => entry.section === 'attention').length;
  const parts = [`${String(on)} on`, `${String(paused)} paused`];
  if (attention > 0) parts.push(`${String(attention)} needs attention`);
  return parts.join(' · ');
}
