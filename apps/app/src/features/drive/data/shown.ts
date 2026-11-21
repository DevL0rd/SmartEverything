import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  DRIVE_ITEM,
  LIBRARY_PAGE,
  PHOTO_FLAGS,
  type DriveChange,
  type DriveItem,
  type LibraryPage,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { pageWithout } from '../../photos';
import { DRIVE_PREFIX } from '../../../queries/keys';
import { albumAddition, createdAddition, writeDriveAdded } from './added';

const log = new Logger('app.store');

export interface DriveItemEdit {
  readonly ids: ReadonlySet<string>;
  readonly change: (item: DriveItem) => DriveItem;
  readonly hiddenIn: (key: QueryKey) => boolean;
  readonly favourite: boolean | null;
}

const KEEP = (item: DriveItem): DriveItem => item;
const NOWHERE = (): boolean => false;
const EVERYWHERE = (): boolean => true;

function kindOf(key: QueryKey): unknown {
  return key[2];
}

function scopeFolderOf(key: QueryKey): unknown {
  const scope = key[3];
  return typeof scope === 'object' && scope !== null && 'folderId' in scope
    ? scope.folderId
    : undefined;
}

function keyNames(key: QueryKey, id: string): boolean {
  return JSON.stringify(key).includes(id);
}

function edit(ids: readonly string[], parts: Partial<DriveItemEdit>): DriveItemEdit {
  return {
    ids: new Set(ids),
    change: parts.change ?? KEEP,
    hiddenIn: parts.hiddenIn ?? NOWHERE,
    favourite: parts.favourite ?? null,
  };
}

function placeEdit(body: DriveChange): DriveItemEdit | null {
  if (body.action === 'trash')
    return edit(body.itemIds, { hiddenIn: (key) => kindOf(key) !== 'trash' });
  if (body.action === 'delete_now') return edit(body.itemIds, { hiddenIn: EVERYWHERE });
  if (body.action === 'restore')
    return edit(body.itemIds, { hiddenIn: (key) => kindOf(key) === 'trash' });
  if (body.action === 'move')
    return edit(body.itemIds, {
      change: (item) => ({ ...item, parentId: body.toFolderId }),
      hiddenIn: (key) => kindOf(key) === 'folder' && scopeFolderOf(key) !== body.toFolderId,
    });
  if (body.action === 'album_remove')
    return edit(body.itemIds, { hiddenIn: (key) => keyNames(key, body.albumId) });
  return null;
}

export function editOfChange(body: DriveChange): DriveItemEdit | null {
  if (body.action === 'rename')
    return edit([body.itemId], { change: (item) => ({ ...item, name: body.name }) });
  if (body.action === 'star' || body.action === 'unstar') {
    const starred = body.action === 'star';
    return edit(body.itemIds, { change: (item) => ({ ...item, starred }), favourite: starred });
  }
  return placeEdit(body);
}

export function hiddenEdit(
  ids: readonly string[],
  hiddenIn: (key: QueryKey) => boolean,
): DriveItemEdit {
  return edit(ids, { hiddenIn });
}

function flagged(page: LibraryPage, ids: ReadonlySet<string>, on: boolean): LibraryPage {
  const bit = PHOTO_FLAGS.favourite;
  return {
    ...page,
    flags: page.flags.map((flags, index) => {
      const id = page.ids[index];
      if (id === undefined || !ids.has(id)) return flags;
      return on ? flags | bit : flags & ~bit;
    }),
  };
}

function editedPage(value: object, target: DriveItemEdit, hidden: boolean): unknown {
  const page = LIBRARY_PAGE.safeParse(value);
  if (!page.success || !page.data.ids.some((id) => target.ids.has(id))) return null;
  const kept = hidden ? pageWithout(page.data, target.ids) : page.data;
  return target.favourite === null ? kept : flagged(kept, target.ids, target.favourite);
}

function targetItem(value: object, target: DriveItemEdit): DriveItem | null {
  if (!('id' in value) || typeof value.id !== 'string' || !target.ids.has(value.id)) return null;
  const item = DRIVE_ITEM.safeParse(value);
  return item.success ? item.data : null;
}

function sameEntries(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function editedArray(value: readonly unknown[], target: DriveItemEdit, hidden: boolean): unknown {
  const next = value.flatMap((entry) => {
    const item = typeof entry === 'object' && entry !== null ? targetItem(entry, target) : null;
    return item !== null && hidden ? [] : [editedValue(entry, target, hidden)];
  });
  return sameEntries(value, next) ? value : next;
}

function editedObject(value: object, target: DriveItemEdit, hidden: boolean): unknown {
  const item = targetItem(value, target);
  if (item !== null) return target.change(item);
  const page = 'ids' in value && 'flags' in value ? editedPage(value, target, hidden) : null;
  if (page !== null) return page;
  const entries: readonly (readonly [string, unknown])[] = Object.entries(value);
  const before = entries.map(([, entry]) => entry);
  const edited = before.map((entry) => editedValue(entry, target, hidden));
  if (sameEntries(before, edited)) return value;
  return Object.fromEntries(entries.map(([name], index) => [name, edited[index]] as const));
}

function editedValue(value: unknown, target: DriveItemEdit, hidden: boolean): unknown {
  if (Array.isArray(value)) return editedArray(value, target, hidden);
  if (typeof value === 'object' && value !== null) return editedObject(value, target, hidden);
  return value;
}

interface Shown {
  readonly key: QueryKey;
  readonly before: unknown;
}

function show(client: QueryClient, target: DriveItemEdit): readonly Shown[] {
  const shown: Shown[] = [];
  for (const [key, before] of client.getQueriesData({ queryKey: DRIVE_PREFIX })) {
    const after = editedValue(before, target, target.hiddenIn(key));
    if (after === before) continue;
    client.setQueryData(key, after);
    shown.push({ key, before });
  }
  return shown;
}

function refresh(client: QueryClient): void {
  background(client.invalidateQueries({ queryKey: DRIVE_PREFIX }), 'queries.invalidate_failed');
}

export interface DriveShownWrite<T> {
  readonly event: string;
  readonly edit: DriveItemEdit | null;
  readonly send: () => Promise<T>;
  readonly incomplete: (answer: T) => boolean;
}

export async function writeDriveShown<T>(
  client: QueryClient,
  write: DriveShownWrite<T>,
): Promise<T> {
  const { edit: target } = write;
  const operation = log.operation(write.event, {
    items: target === null ? 0 : target.ids.size,
    optimistic: target !== null,
  });
  if (target !== null) await client.cancelQueries({ queryKey: DRIVE_PREFIX });
  const shown = target === null ? [] : show(client, target);
  try {
    const answer = await write.send();
    operation.succeeded();
    if (write.incomplete(answer)) refresh(client);
    return answer;
  } catch (error) {
    operation.failed(error, { rolledBack: shown.length });
    for (const { key, before } of shown) client.setQueryData(key, before);
    refresh(client);
    throw error;
  }
}

export function partlyDone(answer: {
  readonly failed: readonly unknown[];
  readonly conflicts: readonly unknown[];
}): boolean {
  return answer.failed.length > 0 || answer.conflicts.length > 0;
}

export function shownDriveChange<T extends Parameters<typeof partlyDone>[0]>(
  client: QueryClient,
  change: (body: DriveChange) => Promise<T>,
): (body: DriveChange) => Promise<T> {
  return (body) => {
    const send = (): Promise<T> => change(body);
    const event = `drive.${body.action}`;
    if (body.action === 'album_add') {
      return writeDriveAdded(client, { event, addition: albumAddition(client, body), send });
    }
    return writeDriveShown(client, {
      event,
      edit: editOfChange(body),
      send,
      incomplete: partlyDone,
    });
  };
}

export function shownDriveCreates<T extends Parameters<typeof partlyDone>[0]>(
  client: QueryClient,
  viewerId: string | null,
  change: (body: DriveChange) => Promise<T>,
): (body: DriveChange) => Promise<T> {
  const shown = shownDriveChange(client, change);
  return (body) => {
    const addition = createdAddition(client, body, { viewerId, now: new Date().toISOString() });
    if (addition === null) return shown(body);
    return writeDriveAdded(client, {
      event: `drive.${body.action}`,
      addition,
      send: () => change(body),
    });
  };
}
