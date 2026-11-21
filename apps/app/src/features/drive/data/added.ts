import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { DRIVE_ITEM, type DriveChange, type DriveItem } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { z } from 'zod';
import { DRIVE_PREFIX } from '../../../queries/keys';

const log = new Logger('app.store');

export interface DriveAddition {
  readonly into: (key: QueryKey) => boolean;
  readonly items: (folder: DriveItem | null) => readonly DriveItem[];
}

type NewFolder = Extract<DriveChange, { readonly action: 'new_folder' }>;
type Copy = Extract<DriveChange, { readonly action: 'copy' }>;
type AlbumAdd = Extract<DriveChange, { readonly action: 'album_add' }>;

const PAGES = z
  .looseObject({ pages: z.array(z.looseObject({ items: z.array(z.unknown()) })).min(1) })
  .readonly();

const FOLDER = DRIVE_ITEM.nullable();

function scopeOf(key: QueryKey): Readonly<Record<string, unknown>> | null {
  const scope = key[3];
  return typeof scope === 'object' && scope !== null && !Array.isArray(scope)
    ? Object.fromEntries(Object.entries(scope))
    : null;
}

function listing(key: QueryKey): Readonly<Record<string, unknown>> | null {
  return key[2] === 'folder' && key[4] !== 'ancestors' ? scopeOf(key) : null;
}

function folderOfPage(page: Readonly<Record<string, unknown>>): DriveItem | null {
  const folder = FOLDER.safeParse(page['folder']);
  return folder.success ? folder.data : null;
}

function idOf(entry: unknown): unknown {
  return typeof entry === 'object' && entry !== null && 'id' in entry ? entry.id : undefined;
}

function hitsWith(hits: unknown, added: readonly DriveItem[]): unknown {
  if (!Array.isArray(hits)) return hits;
  const kept: readonly unknown[] = hits;
  return [...added.map((item) => ({ itemId: item.id, where: 'name', snippet: null })), ...kept];
}

function addedValue(value: unknown, addition: DriveAddition): unknown {
  const parsed = PAGES.safeParse(value);
  if (!parsed.success) return value;
  const [first, ...rest] = parsed.data.pages;
  if (first === undefined) return value;
  const known = new Set(first.items.map(idOf));
  const added = addition.items(folderOfPage(first)).filter((item) => !known.has(item.id));
  if (added.length === 0) return value;
  const page = { ...first, items: [...added, ...first.items] };
  const withHits = 'hits' in first ? { ...page, hits: hitsWith(first['hits'], added) } : page;
  return { ...parsed.data, pages: [withHits, ...rest] };
}

function took(value: object, wanted: ReadonlySet<string>, found: Map<string, DriveItem>): boolean {
  const id = idOf(value);
  if (typeof id !== 'string' || !wanted.has(id) || found.has(id)) return false;
  const item = DRIVE_ITEM.safeParse(value);
  if (item.success) found.set(id, item.data);
  return item.success;
}

function collect(value: unknown, wanted: ReadonlySet<string>, found: Map<string, DriveItem>): void {
  if (found.size === wanted.size) return;
  if (Array.isArray(value)) {
    for (const entry of value) collect(entry, wanted, found);
    return;
  }
  if (typeof value !== 'object' || value === null || took(value, wanted, found)) return;
  for (const entry of Object.values(value)) collect(entry, wanted, found);
}

export function cachedItems(
  client: QueryClient,
  ids: readonly string[],
): ReadonlyMap<string, DriveItem> {
  const found = new Map<string, DriveItem>();
  const wanted = new Set(ids);
  for (const [, value] of client.getQueriesData({ queryKey: DRIVE_PREFIX })) {
    collect(value, wanted, found);
  }
  return found;
}

function etagOf(item: DriveItem): string {
  const content =
    'sha256' in item && item.sha256 !== null
      ? item.sha256
      : `${String(item.bytes)}.${String(Date.parse(item.modifiedAt))}`;
  return `1-${content}`;
}

export interface Made {
  readonly viewerId: string | null;
  readonly now: string;
}

function placed(item: DriveItem, folder: DriveItem | null, made: Made): DriveItem {
  const next = {
    ...item,
    parentId: folder === null ? null : folder.id,
    relPath: folder === null ? item.name : `${folder.relPath}/${item.name}`,
    addedAt: made.now,
    openedAt: null,
    starred: false,
    shared: false,
    locked: folder === null ? false : folder.locked,
    lockedHere: false,
    openComments: 0,
    rev: 1,
    outside: false,
    addedByProfileId: made.viewerId,
    remoteId: null,
    remoteRev: null,
  };
  return { ...next, etag: etagOf(next) };
}

function listsPlace(key: QueryKey, parent: NewFolder['parent']): boolean {
  const scope = listing(key);
  if (scope === null) return false;
  return parent.kind === 'drive'
    ? scope['rootId'] === parent.rootId && scope['folderId'] === null
    : scope['folderId'] === parent.folderId;
}

export function newFolderAddition(body: NewFolder, made: Made): DriveAddition | null {
  const { parent, name, id } = body;
  if (id === undefined) return null;
  return {
    into: (key) => listsPlace(key, parent),
    items: (folder): readonly DriveItem[] => {
      const rootId = parent.kind === 'drive' ? parent.rootId : folder?.rootId;
      if (rootId === undefined) return [];
      const draft: DriveItem = {
        id,
        rootId,
        parentId: null,
        relPath: name,
        name,
        modifiedAt: made.now,
        addedAt: made.now,
        openedAt: null,
        starred: false,
        shared: false,
        locked: false,
        lockedHere: false,
        openComments: 0,
        rev: 1,
        etag: '',
        outside: false,
        addedByProfileId: made.viewerId,
        remoteId: null,
        remoteRev: null,
        kind: 'folder',
        childCount: 0,
        bytes: 0,
        totalBytes: 0,
        totalFiles: 0,
        colour: null,
        iconHint: false,
      };
      return [placed(draft, folder, made)];
    },
  };
}

export function copyAddition(client: QueryClient, body: Copy, made: Made): DriveAddition | null {
  const { copyIds } = body;
  if (copyIds === undefined) return null;
  const sources = cachedItems(client, body.itemIds);
  return {
    into: (key) => listing(key)?.['folderId'] === body.toFolderId,
    items: (folder): readonly DriveItem[] => {
      if (folder === null) return [];
      return body.itemIds.flatMap((sourceId, index) => {
        const source = sources.get(sourceId);
        const id = copyIds[index];
        if (source === undefined || id === undefined) return [];
        return [placed({ ...source, id, rootId: folder.rootId }, folder, made)];
      });
    },
  };
}

export function albumAddition(client: QueryClient, body: AlbumAdd): DriveAddition {
  const items = [...cachedItems(client, body.itemIds).values()];
  return {
    into: (key) => key[2] === 'album-items' && scopeOf(key)?.['albumId'] === body.albumId,
    items: () => items,
  };
}

export function createdAddition(
  client: QueryClient,
  body: DriveChange,
  made: Made,
): DriveAddition | null {
  if (body.action === 'new_folder') return newFolderAddition(body, made);
  if (body.action === 'copy') return copyAddition(client, body, made);
  return null;
}

function refresh(client: QueryClient): void {
  background(client.invalidateQueries({ queryKey: DRIVE_PREFIX }), 'queries.invalidate_failed');
}

export interface DriveAddedWrite<T> {
  readonly event: string;
  readonly addition: DriveAddition;
  readonly send: () => Promise<T>;
}

export async function writeDriveAdded<T>(
  client: QueryClient,
  write: DriveAddedWrite<T>,
): Promise<T> {
  const operation = log.operation(write.event, { optimistic: true });
  await client.cancelQueries({ queryKey: DRIVE_PREFIX });
  const shown: { readonly key: QueryKey; readonly before: unknown }[] = [];
  for (const [key, before] of client.getQueriesData({ queryKey: DRIVE_PREFIX })) {
    if (!write.addition.into(key)) continue;
    const after = addedValue(before, write.addition);
    if (after === before) continue;
    client.setQueryData(key, after);
    shown.push({ key, before });
  }
  try {
    const answer = await write.send();
    operation.succeeded({ shown: shown.length });
    refresh(client);
    return answer;
  } catch (error) {
    operation.failed(error, { rolledBack: shown.length });
    for (const { key, before } of shown) client.setQueryData(key, before);
    refresh(client);
    throw error;
  }
}
