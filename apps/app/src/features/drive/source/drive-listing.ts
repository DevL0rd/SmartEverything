import {
  DRIVE_SNIPPET_CLOSE,
  DRIVE_SNIPPET_OPEN,
  type DriveHit,
  type DriveItem,
  type DriveQuery,
  type DriveShortcut,
  type DriveSort,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import {
  filterWordsOf,
  matchRangesOf,
  plainSnippetOf,
  type FileCrumb,
  type FileHit,
  type FilePlace,
  type FileSortOrder,
  type InfoRow,
  type SearchMatch,
  type SearchQuery,
} from '../../files';
import { ENTRY_LABEL, entryLineOf, isContentItem, isEntryItem } from '../model/item-content';
import { foldersOf, wasInText } from '../trash/trash-model';
import {
  type DriveNode,
  type DriveNodeContext,
  type DriveOrigin,
  driveNodeOf,
  shortcutNodeOf,
} from './drive-node';

const SORT_FIELD = { name: 'name', size: 'bytes', modifiedAt: 'modifiedAt' } as const;

export function driveSortOf(sort: FileSortOrder): DriveSort | null {
  return sort.field === 'by' ? null : { field: SORT_FIELD[sort.field], direction: sort.direction };
}

export function driveQueryOf(
  query: SearchQuery,
  scope: { readonly rootId: string | null; readonly folderId: string | null },
): Omit<DriveQuery, 'cursor'> {
  const text = query.text.trim();
  return {
    text: text === '' ? null : text,
    match: query.contents ? 'all' : 'names',
    rootId: scope.rootId,
    folderId: scope.folderId,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'name', direction: 'asc' },
  };
}

function hitOf(hit: DriveHit | undefined, item: DriveItem, words: readonly string[]): FileHit {
  if (hit === undefined || hit.where === 'name' || hit.snippet === null) {
    return {
      where: 'name',
      snippet: null,
      line: null,
      ranges: matchRangesOf(item.name, words) ?? [],
    };
  }
  const plain = plainSnippetOf(hit.snippet, DRIVE_SNIPPET_OPEN, DRIVE_SNIPPET_CLOSE);
  return { where: hit.where, snippet: plain.snippet, line: null, ranges: plain.ranges };
}

export interface DriveFound {
  readonly items: readonly DriveItem[];
  readonly hits: readonly DriveHit[];
  readonly shortcuts: readonly DriveShortcut[];
}

export function searchMatchesOf(
  found: DriveFound,
  query: SearchQuery,
  context: DriveNodeContext,
): readonly SearchMatch<DriveOrigin>[] {
  const words = filterWordsOf(query.text);
  const byItem = new Map(found.hits.map((hit) => [hit.itemId, hit]));
  const items = found.items.map((item) => ({
    node: driveNodeOf(item, context),
    hit: hitOf(byItem.get(item.id), item, words),
  }));
  const shortcuts = found.shortcuts.map((shortcut) => ({
    node: shortcutNodeOf(shortcut, context),
    hit: {
      where: 'name' as const,
      snippet: null,
      line: null,
      ranges: matchRangesOf(shortcut.name, words) ?? [],
    },
  }));
  return [...items, ...shortcuts];
}

export function crumbsOf(
  place: FilePlace | undefined,
  placeKey: string,
  chain: readonly DriveItem[],
  context: DriveNodeContext,
): readonly FileCrumb<DriveOrigin>[] {
  const root: readonly FileCrumb<DriveOrigin>[] =
    place === undefined ? [] : [{ key: place.key, label: place.label, location: place.location }];
  const inner = chain.map((item): FileCrumb<DriveOrigin> => ({
    key: item.id,
    label: item.name,
    location: { place: placeKey, folder: item.id },
    leading: driveNodeOf(item, context),
  }));
  return [...root, ...inner];
}

export type ReadItem = (itemId: string) => Promise<DriveItem>;

export async function ancestorsOf(
  folder: DriveItem,
  read: ReadItem,
  stopAt: string | null,
): Promise<readonly DriveItem[]> {
  const chain: DriveItem[] = [];
  let current: DriveItem = folder;
  while (current.parentId !== null && current.id !== stopAt) {
    current = await read(current.parentId);
    chain.unshift(current);
  }
  return chain;
}

const KIND_TEXT: Readonly<Record<DriveNode['kind'], string>> = {
  folder: 'Folder',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  archive: 'Archive',
  link: 'Link',
  special: 'Special file',
  other: 'File',
};

function kindValueOf(node: DriveNode, item: DriveItem): string {
  if (isEntryItem(item)) return ENTRY_LABEL[item.kind];
  return joinParts([KIND_TEXT[node.kind], isContentItem(item) ? item.mime : null]);
}

export function infoRowsOf(
  node: DriveNode,
  facts: {
    readonly when: (at: string) => string;
    readonly nameOf: (profileId: string) => string | null;
    readonly rootLabelOf: (rootId: string) => string | null;
  },
): readonly InfoRow[] {
  const { origin } = node;
  if (origin.kind === 'trash') {
    return [
      { key: 'kind', label: 'Kind', value: KIND_TEXT[node.kind] },
      ...(node.size === null ? [] : [{ key: 'size', label: 'Size', value: bytes(node.size) }]),
      {
        key: 'was',
        label: 'Was in',
        value: wasInText(
          facts.rootLabelOf(origin.entry.rootId),
          foldersOf(origin.entry.originalRelPath),
        ),
      },
      { key: 'deleted', label: 'Deleted', value: facts.when(origin.entry.deletedAt) },
      { key: 'purge', label: 'Gone for good', value: facts.when(origin.entry.purgeAt) },
    ];
  }
  const item = origin.item;
  if (item === null) return [{ key: 'kind', label: 'Kind', value: 'Shortcut' }];
  const parent = item.relPath.split('/').slice(0, -1).join('/');
  const by = item.addedByProfileId === null ? null : facts.nameOf(item.addedByProfileId);
  return [
    { key: 'kind', label: 'Kind', value: kindValueOf(node, item) },
    ...(item.kind === 'link'
      ? [{ key: 'target', label: 'Points to', value: item.linkTarget }]
      : []),
    ...(item.kind === 'special'
      ? [{ key: 'what', label: 'What it is', value: entryLineOf(item) }]
      : []),
    ...(node.size === null ? [] : [{ key: 'size', label: 'Size', value: bytes(node.size) }]),
    { key: 'modified', label: 'Modified', value: facts.when(item.modifiedAt) },
    { key: 'added', label: 'Added', value: joinParts([facts.when(item.addedAt), by]) },
    ...(parent === '' ? [] : [{ key: 'where', label: 'Where', value: parent }]),
  ];
}
