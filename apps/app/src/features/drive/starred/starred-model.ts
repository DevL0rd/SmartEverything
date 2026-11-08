import type { DriveItem, DriveQuery } from '@smarteverything/domain';
import { count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';

export type StarredChip = 'all' | 'folders' | 'files' | 'photos';

type ItemKind = DriveItem['kind'];

export const STARRED_CHIPS: readonly { readonly chip: StarredChip; readonly label: string }[] = [
  { chip: 'all', label: 'All' },
  { chip: 'files', label: 'Files' },
  { chip: 'folders', label: 'Folders' },
  { chip: 'photos', label: 'Photos' },
];

const CHIP_KINDS: Readonly<Record<StarredChip, readonly ItemKind[] | null>> = {
  all: null,
  folders: ['folder'],
  files: ['document', 'audio', 'other'],
  photos: ['image', 'video'],
};

export function starredQueryOf(chip: StarredChip): Omit<DriveQuery, 'cursor'> {
  return {
    text: null,
    rootId: null,
    folderId: null,
    kinds: CHIP_KINDS[chip],
    starred: true,
    duration: null,
    taken: null,
    sort: { field: 'modifiedAt', direction: 'desc' },
  };
}

export function chipOf(item: Pick<DriveItem, 'kind'>): Exclude<StarredChip, 'all'> {
  if (item.kind === 'folder') return 'folders';
  return item.kind === 'image' || item.kind === 'video' ? 'photos' : 'files';
}

export type ChipCounts = Readonly<Record<StarredChip, number | null>>;

const UNKNOWN: ChipCounts = { all: null, folders: null, files: null, photos: null };

export interface KindWindow {
  readonly items: readonly Pick<DriveItem, 'kind'>[];
  readonly complete: boolean;
}

export interface CountsInput {
  readonly chip: StarredChip;
  readonly all: KindWindow;
  readonly shown: KindWindow;
}

export function chipCountsOf(input: CountsInput): ChipCounts {
  if (input.all.complete) {
    const items = input.all.items;
    return {
      all: items.length,
      folders: items.filter((item) => chipOf(item) === 'folders').length,
      files: items.filter((item) => chipOf(item) === 'files').length,
      photos: items.filter((item) => chipOf(item) === 'photos').length,
    };
  }
  if (!input.shown.complete) return UNKNOWN;
  return { ...UNKNOWN, [input.chip]: input.shown.items.length };
}

export const STAR_NOTE = 'A star here and a Photos favourite are one mark';

export const SMART_NOTE = 'Saved filters that stay up to date as files change';

export function starredSubtitleOf(starred: number | null, smartFolders: number): string {
  return joinParts([
    starred === null ? null : `${count(starred)} starred`,
    smartFolders === 0 ? null : plural(smartFolders, 'smart folder'),
  ]);
}

export function nothingStarredBody(chip: StarredChip): string {
  switch (chip) {
    case 'all':
      return 'Star files and folders you open often. Favourite photos show here too.';
    case 'folders':
      return 'Star a folder to keep it here.';
    case 'files':
      return 'Star a document, a song or any other file to keep it here.';
    case 'photos':
      return 'Favourite photos and videos show here, and stars on photos show in Photos.';
  }
}
