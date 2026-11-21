import type { PhotoGroup, PhotoPeople } from '@smarteverything/domain';
import { count } from '../../../format/number';
import {
  mergeCandidatesOf,
  peopleSectionsOf,
  speciesChipsOf,
  suggestionKey,
  type SpeciesChip,
} from './model';

export const UNSORTED_NOTE = 'Faces seen in one photo so far. Name one to start a person.';

export const HIDDEN_NOTE =
  'Hidden from People and pets and from search suggestions. Open one to show it again.';

export const MERGE_CARD_MIN = 288;

export const MERGE_GAP = 12;

const TILE_GUTTER = 16;

export type GroupPair = readonly [PhotoGroup, PhotoGroup];

export type RowTop = 'section' | 'merge' | 'chips' | 'grid' | 'none';

export type PeopleRow =
  | {
      readonly kind: 'title';
      readonly key: string;
      readonly title: string;
      readonly detail: string;
      readonly note: string | null;
    }
  | {
      readonly kind: 'species';
      readonly key: string;
      readonly chips: readonly SpeciesChip[];
      readonly species: string | null;
    }
  | {
      readonly kind: 'merge';
      readonly key: string;
      readonly top: RowTop;
      readonly pairs: readonly GroupPair[];
    }
  | {
      readonly kind: 'tiles';
      readonly key: string;
      readonly top: RowTop;
      readonly groups: readonly PhotoGroup[];
    };

export interface PeopleLayout {
  readonly width: number;
  readonly size: number;
  readonly live: boolean;
  readonly species: string | null;
}

export function groupColumnsOf(width: number, size: number): number {
  return Math.max(1, Math.floor(width / (size + TILE_GUTTER)));
}

export function gridWidthOf(content: number): number {
  return content + TILE_GUTTER;
}

export function tileWidthOf(content: number, size: number): number {
  const grid = gridWidthOf(content);
  return grid / groupColumnsOf(grid, size);
}

export function mergeColumnsOf(width: number): number {
  return Math.max(1, Math.floor((width + MERGE_GAP) / (MERGE_CARD_MIN + MERGE_GAP)));
}

function chunks<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

export function pairKeyOf(pair: GroupPair): string {
  return suggestionKey({ groupIds: [pair[0].id, pair[1].id], similarity: 0 });
}

function mergeRowsOf(people: PhotoPeople, width: number): readonly PeopleRow[] {
  const pairs = mergeCandidatesOf(people.mergeSuggestions, people.groups);
  return chunks(pairs, mergeColumnsOf(width)).map((row, index) => ({
    kind: 'merge' as const,
    key: `merge:${row.map(pairKeyOf).join(',')}`,
    top: index === 0 ? ('section' as const) : ('merge' as const),
    pairs: row,
  }));
}

function tileRowsOf(
  section: string,
  groups: readonly PhotoGroup[],
  layout: PeopleLayout,
  first: RowTop,
): readonly PeopleRow[] {
  const columns = groupColumnsOf(gridWidthOf(layout.width), layout.size);
  return chunks(groups, columns).map((row, index) => ({
    kind: 'tiles' as const,
    key: `${section}:${row.map((group) => group.id).join(',')}`,
    top: index === 0 ? first : ('none' as const),
    groups: row,
  }));
}

interface SectionSpec {
  readonly section: string;
  readonly title: string;
  readonly note: string | null;
}

function groupSectionOf(
  spec: SectionSpec,
  groups: readonly PhotoGroup[],
  layout: PeopleLayout,
): readonly PeopleRow[] {
  if (groups.length === 0) return [];
  const { section, title, note } = spec;
  return [
    { kind: 'title', key: `${section}:title`, title, detail: count(groups.length), note },
    ...tileRowsOf(section, groups, layout, 'grid'),
  ];
}

function petRowsOf(
  all: readonly PhotoGroup[],
  pets: readonly PhotoGroup[],
  layout: PeopleLayout,
): readonly PeopleRow[] {
  const chips = speciesChipsOf(all);
  if (chips.length === 0) return [];
  const total = chips.reduce((sum, chip) => sum + chip.count, 0);
  return [
    { kind: 'title', key: 'pets:title', title: 'Pets', detail: count(total), note: null },
    ...(chips.length < 2
      ? []
      : [{ kind: 'species' as const, key: 'pets:species', chips, species: layout.species }]),
    ...tileRowsOf('pets', pets, layout, 'chips'),
  ];
}

export function peopleRowsOf(people: PhotoPeople, layout: PeopleLayout): readonly PeopleRow[] {
  const sections = peopleSectionsOf(people.groups, layout.species);
  return [
    ...(layout.live ? mergeRowsOf(people, layout.width) : []),
    ...groupSectionOf({ section: 'people', title: 'People', note: null }, sections.people, layout),
    ...petRowsOf(people.groups, sections.pets, layout),
    ...groupSectionOf(
      { section: 'unsorted', title: 'Unsorted faces', note: UNSORTED_NOTE },
      sections.unsorted,
      layout,
    ),
    ...groupSectionOf(
      { section: 'hidden', title: 'Hidden', note: HIDDEN_NOTE },
      sections.hidden,
      layout,
    ),
  ];
}

function sameList<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function chipKeysOf(chips: readonly SpeciesChip[]): readonly string[] {
  return chips.map((chip) => `${chip.species}:${String(chip.count)}`);
}

type RowOf<K extends PeopleRow['kind']> = Extract<PeopleRow, { readonly kind: K }>;

function sameTitle(left: RowOf<'title'>, right: PeopleRow): boolean {
  return (
    right.kind === 'title' &&
    left.title === right.title &&
    left.detail === right.detail &&
    left.note === right.note
  );
}

function sameSpecies(left: RowOf<'species'>, right: PeopleRow): boolean {
  return (
    right.kind === 'species' &&
    left.species === right.species &&
    sameList(chipKeysOf(left.chips), chipKeysOf(right.chips))
  );
}

function sameMerge(left: RowOf<'merge'>, right: PeopleRow): boolean {
  return (
    right.kind === 'merge' &&
    left.top === right.top &&
    sameList(left.pairs.flat(), right.pairs.flat())
  );
}

function sameTiles(left: RowOf<'tiles'>, right: PeopleRow): boolean {
  return right.kind === 'tiles' && left.top === right.top && sameList(left.groups, right.groups);
}

export function samePeopleRow(left: PeopleRow, right: PeopleRow): boolean {
  switch (left.kind) {
    case 'title':
      return sameTitle(left, right);
    case 'species':
      return sameSpecies(left, right);
    case 'merge':
      return sameMerge(left, right);
    case 'tiles':
      return sameTiles(left, right);
  }
}
