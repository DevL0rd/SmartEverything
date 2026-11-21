import type { DriveItem } from '@smarteverything/domain';
import type { DriveItemTextWrite } from '../../store/repositories/drive-item-text';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import type { ContentResponse } from '../content/content-protocol';

const WINDOW_ROWS = 1000;

export type TextFile = Exclude<DriveItem, { readonly kind: 'folder' | 'link' | 'special' }>;

export type TextFolder = Extract<DriveItem, { readonly kind: 'folder' }>;

export type TextStore = Pick<Store, 'driveItems' | 'driveItemText' | 'driveFeed'>;

export interface TextBacklog {
  readonly work: readonly TextFile[];
  readonly files: number;
  readonly settled: number;
}

class Tally {
  readonly work: TextFile[] = [];
  files = 0;
  settled = 0;

  constructor(private readonly store: Pick<TextStore, 'driveItemText'>) {}

  add(item: DriveItem): void {
    if (!isDocument(item)) return;
    this.files += 1;
    if (this.store.driveItemText.find(item.id)?.rev === item.rev) {
      this.settled += 1;
      return;
    }
    this.work.push(item);
  }

  backlog(): TextBacklog {
    return { work: this.work, files: this.files, settled: this.settled };
  }
}

function isDocument(item: DriveItem): item is TextFile {
  return (
    item.kind !== 'folder' &&
    item.kind !== 'link' &&
    item.kind !== 'special' &&
    item.kind !== 'image' &&
    item.kind !== 'video'
  );
}

export function collectTextBacklog(store: TextStore, rootId: string): TextBacklog {
  const tally = new Tally(store);
  const pending: (string | null)[] = [null];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    let after: string | null = null;
    do {
      const window = store.driveItems.children({
        rootId,
        parentId: parent,
        after,
        limit: WINDOW_ROWS,
        viewer: null,
      });
      for (const { item } of window.entries) {
        if (item.kind === 'folder') pending.push(item.id);
        else tally.add(item);
      }
      after = window.next;
    } while (after !== null);
  }
  return tally.backlog();
}

interface Changes {
  readonly items: readonly DriveItem[];
  readonly folders: readonly TextFolder[];
}

export function changesSince(store: TextStore, rootId: string, after: number): Changes {
  const ids = new Set<string>();
  for (let cursor: number | null = after; cursor !== null;) {
    const window = store.driveFeed.sinceInRoot(rootId, cursor, WINDOW_ROWS);
    for (const row of window.rows) ids.add(row.itemId);
    cursor = window.next;
  }
  const items: DriveItem[] = [];
  const folders = new Map<string, TextFolder>();
  const folder = (id: string | null): void => {
    if (id === null || folders.has(id)) return;
    const found = store.driveItems.find(id, null);
    if (found?.kind === 'folder') folders.set(found.id, found);
  };
  for (const id of ids) {
    const item = store.driveItems.find(id, null);
    if (item === undefined) continue;
    items.push(item);
    if (item.kind === 'folder') folder(item.id);
    folder(item.parentId);
  }
  return { items, folders: [...folders.values()] };
}

export interface TextSinceInput {
  readonly rootId: string;
  readonly after: number | undefined;
}

export function textBacklog(store: TextStore, input: TextSinceInput): TextBacklog {
  if (input.after === undefined) return collectTextBacklog(store, input.rootId);
  const tally = new Tally(store);
  for (const item of changesSince(store, input.rootId, input.after).items) tally.add(item);
  return tally.backlog();
}

export function changedFolders(
  store: TextStore,
  input: { readonly rootId: string; readonly after: number },
): readonly TextFolder[] {
  return changesSince(store, input.rootId, input.after).folders;
}

function written(item: TextFile, result: ContentResponse['result']): DriveItemTextWrite {
  const base = { itemId: item.id, rev: item.rev, source: 'document' as const };
  switch (result.state) {
    case 'ok':
      return { ...base, state: 'ok', body: result.body };
    case 'empty':
      return { ...base, state: 'empty' };
    case 'unsupported':
    case 'failed':
      return { ...base, state: result.state, reason: result.reason };
  }
}

export interface TextRecordInput {
  readonly item: TextFile;
  readonly result: ContentResponse['result'];
}

export function recordText(
  store: Pick<TextStore, 'driveItems' | 'driveItemText'>,
  input: TextRecordInput,
): boolean {
  const current = store.driveItems.find(input.item.id, null);
  if (current?.rev !== input.item.rev) return false;
  store.driveItemText.put(written(input.item, input.result));
  return true;
}

export const DRIVE_TEXT_BACKLOG_UNIT = storeUnit(textBacklog);

export const DRIVE_TEXT_FOLDERS_UNIT = storeUnit(changedFolders);

export const DRIVE_TEXT_RECORD_UNIT = storeUnit(recordText);
