import { count } from '../../../format/number';
import type { TrashItem } from './trash-model';

export type TrashChip = 'everything' | 'mine' | 'folders';

export interface TrashFilter {
  readonly chip: TrashChip;
  readonly query: string;
}

export const NO_FILTER: TrashFilter = { chip: 'everything', query: '' };

export interface TrashChipDef {
  readonly chip: TrashChip;
  readonly label: string;
}

const EVERYTHING: TrashChipDef = { chip: 'everything', label: 'Everything' };
const MINE: TrashChipDef = { chip: 'mine', label: 'Deleted by you' };
const FOLDERS: TrashChipDef = { chip: 'folders', label: 'Folders' };

export function trashChipsOf(owner: boolean): readonly TrashChipDef[] {
  return owner ? [EVERYTHING, MINE, FOLDERS] : [EVERYTHING, FOLDERS];
}

function chipMatches(chip: TrashChip, item: TrashItem): boolean {
  if (chip === 'mine') return item.deleter.kind === 'you';
  if (chip === 'folders') return item.isFolder;
  return true;
}

function needleOf(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function filterTrash(
  items: readonly TrashItem[],
  filter: TrashFilter,
): readonly TrashItem[] {
  const needle = needleOf(filter.query);
  if (filter.chip === 'everything' && needle === '') return items;
  return items.filter(
    (item) =>
      chipMatches(filter.chip, item) &&
      (needle === '' || item.name.toLocaleLowerCase().includes(needle)),
  );
}

export function chipCountsOf(
  items: readonly TrashItem[],
  query: string,
): Readonly<Record<TrashChip, number>> {
  const counted = { everything: 0, mine: 0, folders: 0 };
  for (const item of filterTrash(items, { chip: 'everything', query })) {
    counted.everything += 1;
    if (chipMatches('mine', item)) counted.mine += 1;
    if (chipMatches('folders', item)) counted.folders += 1;
  }
  return counted;
}

export function isFiltered(filter: TrashFilter): boolean {
  return filter.chip !== 'everything' || needleOf(filter.query) !== '';
}

export function shownText(shown: number, total: number): string {
  return `${count(shown)} of ${count(total)}`;
}
