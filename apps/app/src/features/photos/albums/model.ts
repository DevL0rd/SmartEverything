import type { DriveAlbum, SmartRule, SmartRuleLeaf } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { compareText } from '../../../format/text';
import { bytes, count } from '../../../format/number';
import { monthShort, playTime, startOfDayKey } from '../../../format/time';

export type AlbumSort = 'recent' | 'name' | 'items';

export const ALBUM_SORTS: readonly { readonly value: AlbumSort; readonly label: string }[] = [
  { value: 'recent', label: 'Recent first' },
  { value: 'name', label: 'Name' },
  { value: 'items', label: 'Most items' },
];

export interface Visibility {
  readonly label: string;
  readonly icon: IconName;
}

const ONLY_YOU: Visibility = { label: 'Only you', icon: 'lock' };
const EVERYONE: Visibility = { label: 'Everyone at home', icon: 'users' };

export function visibilityOf(scope: DriveAlbum['scope']): Visibility {
  return scope === 'person' ? ONLY_YOU : EVERYONE;
}

export function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

export function itemsText(value: number): string {
  return plural(value, 'item', 'items');
}

const ORDER: Readonly<Record<AlbumSort, (left: DriveAlbum, right: DriveAlbum) => number>> = {
  recent: (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  name: (left, right) => compareText(left.title, right.title),
  items: (left, right) => right.itemCount - left.itemCount,
};

export interface AlbumGroups {
  readonly smart: readonly DriveAlbum[];
  readonly manual: readonly DriveAlbum[];
}

export function albumGroups(albums: readonly DriveAlbum[], sort: AlbumSort): AlbumGroups {
  const sorted = [...albums].sort(
    (left, right) => ORDER[sort](left, right) || compareText(left.title, right.title),
  );
  return {
    smart: sorted.filter((album) => album.kind === 'smart'),
    manual: sorted.filter((album) => album.kind === 'manual'),
  };
}

export function albumsLine(albums: readonly DriveAlbum[]): string {
  const smart = albums.filter((album) => album.kind === 'smart').length;
  const all = plural(albums.length, 'album', 'albums');
  if (smart === 0) return all;
  return `${all} · ${plural(smart, 'smart album fills itself', 'smart albums fill themselves')}`;
}

function dayParts(day: string): {
  readonly date: number;
  readonly month: string;
  readonly year: string;
} {
  return {
    date: Number(day.slice(8, 10)),
    month: monthShort(startOfDayKey(day)),
    year: day.slice(0, 4),
  };
}

export function dayText(day: string): string {
  const parts = dayParts(day);
  return `${String(parts.date)} ${parts.month} ${parts.year}`;
}

export function dayRange(from: string, to: string): string {
  if (from === to) return dayText(from);
  const start = dayParts(from);
  const end = dayParts(to);
  const tail = `${String(end.date)} ${end.month} ${end.year}`;
  if (start.year !== end.year) return `${dayText(from)} to ${tail}`;
  if (start.month !== end.month) return `${String(start.date)} ${start.month} to ${tail}`;
  return `${String(start.date)} to ${tail}`;
}

const KIND_WORDS: Readonly<Record<string, string>> = {
  image: 'Photos',
  video: 'Videos',
  audio: 'Audio',
  document: 'Documents',
  other: 'Other files',
};

function kindText(kinds: readonly string[]): string {
  const words = kinds.map((kind) => KIND_WORDS[kind] ?? kind);
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${(words.at(-1) ?? '').toLowerCase()}`;
}

const DATE_WORD: Readonly<Record<'takenAt' | 'addedAt' | 'modifiedAt', string>> = {
  takenAt: 'Taken',
  addedAt: 'Added',
  modifiedAt: 'Changed',
};

function dateText(word: string, from: string | null, to: string | null): string {
  if (from !== null && to !== null) return `${word} ${dayRange(from, to)}`;
  if (from !== null) return `${word} from ${dayText(from)}`;
  return to === null ? `${word} any time` : `${word} until ${dayText(to)}`;
}

function between(
  min: number | null,
  max: number | null,
  format: (value: number) => string,
): string {
  if (min !== null && max !== null) return `${format(min)} to ${format(max)}`;
  if (min !== null) return `over ${format(min)}`;
  return max === null ? 'any' : `under ${format(max)}`;
}

const TEXT_WORD: Readonly<Record<string, string>> = {
  name: 'Name has',
  path: 'Folder path has',
  camera: 'Camera',
  lens: 'Lens',
};

function textOf(field: string, contains: string): string {
  return `${TEXT_WORD[field] ?? field} ${contains}`;
}

export function leafText(leaf: SmartRuleLeaf): string {
  switch (leaf.kind) {
    case 'item_kind':
      return kindText(leaf.itemKinds);
    case 'text':
      return textOf(leaf.field, leaf.contains);
    case 'date_range':
      return dateText(DATE_WORD[leaf.field], leaf.from, leaf.to);
    case 'in_root':
      return 'In one library folder';
    case 'in_folder':
      return 'In one folder';
    case 'starred':
      return leaf.starred ? 'Favourites' : 'Not favourites';
    case 'size_range':
      return `Size ${between(leaf.minBytes, leaf.maxBytes, bytes)}`;
    case 'duration_range':
      return `Length ${between(leaf.minMs, leaf.maxMs, (ms) => playTime(ms / 1000))}`;
  }
}

const TEXT_ICON: Readonly<Record<string, IconName>> = {
  name: 'fileText',
  path: 'folder',
  camera: 'camera',
  lens: 'aperture',
};

export function leafIcon(leaf: SmartRuleLeaf): IconName {
  switch (leaf.kind) {
    case 'item_kind':
      return 'image';
    case 'text':
      return TEXT_ICON[leaf.field] ?? 'fileText';
    case 'date_range':
      return 'calendar';
    case 'in_root':
      return 'server';
    case 'in_folder':
      return 'folder';
    case 'starred':
      return 'star';
    case 'size_range':
      return 'box';
    case 'duration_range':
      return 'timer';
  }
}

export function ruleLine(rule: SmartRule): string {
  return rule.rules.map(leafText).join(rule.match === 'all' ? ' · ' : ' or ');
}

export function ruleLead(rule: SmartRule): string {
  return rule.match === 'all'
    ? 'Updates itself when all rules match'
    : 'Updates itself when any rule matches';
}
