import { count } from '../../../format/number';
import type { DriveChipKey, DriveFilter } from '../model/drive-chip';
import type { TrashItem } from './trash-model';

export type TrashChip = 'everything' | 'mine' | 'folders';

export interface TrashFilter {
  readonly chip: TrashChip;
  readonly drive: DriveFilter;
  readonly query: string;
}

export const NO_FILTER: TrashFilter = { chip: 'everything', drive: 'all', query: '' };

export type TrashDriveOf = (item: TrashItem) => DriveChipKey;

export interface TrashChipDef {
  readonly chip: TrashChip;
  readonly label: string;
}

const EVERYTHING: TrashChipDef = { chip: 'everything', label: 'Everything' };
const MINE: TrashChipDef = { chip: 'mine', label: 'Deleted by you' };
const FOLDERS: TrashChipDef = { chip: 'folders', label: 'Folders' };

export const TRASH_CHIPS: readonly TrashChipDef[] = [EVERYTHING, MINE, FOLDERS];

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
  driveOf: TrashDriveOf,
): readonly TrashItem[] {
  const needle = needleOf(filter.query);
  if (filter.chip === 'everything' && filter.drive === 'all' && needle === '') return items;
  return items.filter(
    (item) =>
      (filter.drive === 'all' || driveOf(item) === filter.drive) &&
      chipMatches(filter.chip, item) &&
      (needle === '' || item.name.toLocaleLowerCase().includes(needle)),
  );
}

export function chipCountsOf(
  items: readonly TrashItem[],
  filter: Pick<TrashFilter, 'drive' | 'query'>,
  driveOf: TrashDriveOf,
): Readonly<Record<TrashChip, number>> {
  const counted = { everything: 0, mine: 0, folders: 0 };
  for (const item of filterTrash(items, { ...filter, chip: 'everything' }, driveOf)) {
    counted.everything += 1;
    if (chipMatches('mine', item)) counted.mine += 1;
    if (chipMatches('folders', item)) counted.folders += 1;
  }
  return counted;
}

export function isFiltered(filter: TrashFilter): boolean {
  return filter.chip !== 'everything' || filter.drive !== 'all' || needleOf(filter.query) !== '';
}

export function deletableNow(item: TrashItem, owner: boolean, driveOf: TrashDriveOf): boolean {
  return owner || driveOf(item) === 'mine' || item.deleter.kind === 'you';
}

export function shownText(shown: number, total: number): string {
  return `${count(shown)} of ${count(total)}`;
}
