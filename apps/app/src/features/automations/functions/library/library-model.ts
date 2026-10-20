import type {
  AutomationFunctionInterface,
  AutomationFunctionSummary,
} from '@smarteverything/domain';
import { compareText } from '../../../../format/text';

export type LibrarySectionId = 'mine' | 'builtin' | 'shared';

export interface LibraryRow {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly category: string | null;
  readonly kindLabel: string;
  readonly interfaceLine: string;
  readonly usersLabel: string;
  readonly versionLabel: string;
  readonly builtin: boolean;
  readonly needsMapping: boolean;
  readonly section: LibrarySectionId;
}

export interface LibrarySection {
  readonly id: LibrarySectionId;
  readonly title: string;
  readonly rows: readonly LibraryRow[];
}

export interface LibraryFilter {
  readonly query: string;
  readonly category: string | null;
}

export interface LibraryContext {
  readonly userId: string | null;
  readonly needsMapping: ReadonlySet<string>;
}

export const EMPTY_FILTER: LibraryFilter = { query: '', category: null };

const SECTION_TITLES: Readonly<Record<LibrarySectionId, string>> = {
  mine: 'My nodes',
  builtin: 'Built in',
  shared: 'Shared by others',
};

const SECTION_ORDER: readonly LibrarySectionId[] = ['mine', 'builtin', 'shared'];

export function kindLabel(flavour: AutomationFunctionInterface['flavour']): string {
  return flavour === 'pure' ? 'Value node' : 'Step node';
}

export function interfaceLine(
  spec: Pick<AutomationFunctionInterface, 'inputs' | 'outputs'>,
): string {
  const names = (list: readonly { readonly name: string }[]): string =>
    list.length === 0 ? 'nothing' : list.map((port) => port.name).join(', ');
  return `in: ${names(spec.inputs)} · out: ${names(spec.outputs)}`;
}

export function placesText(count: number): string {
  return count === 1 ? '1 place' : `${String(count)} places`;
}

export function usersLabel(count: number): string {
  return count === 0 ? 'Not used yet' : `Used in ${placesText(count)}`;
}

function sectionOf(entry: AutomationFunctionSummary, userId: string | null): LibrarySectionId {
  if (entry.builtin) return 'builtin';
  return userId !== null && entry.createdBy === userId ? 'mine' : 'shared';
}

export function libraryRows(
  entries: readonly AutomationFunctionSummary[],
  context: LibraryContext,
): readonly LibraryRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    icon: entry.icon,
    category: entry.category,
    kindLabel: kindLabel(entry.interface.flavour),
    interfaceLine: interfaceLine(entry.interface),
    usersLabel: usersLabel(entry.users),
    versionLabel: `Version ${String(entry.revision)}`,
    builtin: entry.builtin,
    needsMapping: context.needsMapping.has(entry.id),
    section: sectionOf(entry, context.userId),
  }));
}

export function categoriesOf(rows: readonly LibraryRow[]): readonly string[] {
  const found = new Set<string>();
  for (const row of rows) {
    if (row.category !== null) found.add(row.category);
  }
  return [...found].sort(compareText);
}

function matches(row: LibraryRow, filter: LibraryFilter): boolean {
  if (filter.category !== null && row.category !== filter.category) return false;
  const query = filter.query.trim().toLowerCase();
  if (query === '') return true;
  return [row.name, row.interfaceLine, row.category ?? ''].some((text) =>
    text.toLowerCase().includes(query),
  );
}

export function librarySections(
  rows: readonly LibraryRow[],
  filter: LibraryFilter,
): readonly LibrarySection[] {
  const shown = rows.filter((row) => matches(row, filter));
  return SECTION_ORDER.flatMap((id) => {
    const inSection = shown
      .filter((row) => row.section === id)
      .sort((left, right) => compareText(left.name, right.name));
    return inSection.length === 0 ? [] : [{ id, title: SECTION_TITLES[id], rows: inSection }];
  });
}

export type LibraryEmpty = 'none-yet' | 'no-match' | 'no-own' | null;

export function libraryEmpty(
  rows: readonly LibraryRow[],
  sections: readonly LibrarySection[],
  filter: LibraryFilter,
): LibraryEmpty {
  if (rows.length === 0) return 'none-yet';
  if (sections.length === 0) return 'no-match';
  const filtering = filter.query.trim() !== '' || filter.category !== null;
  const ownShown = sections.some((section) => section.id === 'mine');
  return !filtering && !ownShown && !rows.some((row) => row.section === 'mine') ? 'no-own' : null;
}
