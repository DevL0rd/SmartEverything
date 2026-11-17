import type { DriveActivity } from '../activity';
import type { DriveItem } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { DriveItemTextWrite } from '../../store/repositories/drive-item-text';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { Store } from '../../store/store';
import type { DriveJobHandlers } from '../jobs';
import { DrivePathError, resolveInRoot } from '../paths';
import { readDriveSettings } from '../settings';
import type { RootAvailability } from '../root-marker';
import type { ContentResponse } from './content-protocol';
import { ContentWorker } from './content-worker-client';
import type { FolderIconRefresher } from './folder-icon/refresh';

const WINDOW_ROWS = 1000;

type FileItem = Exclude<DriveItem, { readonly kind: 'folder' | 'link' | 'special' }>;

export interface TextEnvironment {
  readonly store: Pick<
    Store,
    'driveRoots' | 'driveItems' | 'driveItemText' | 'driveFeed' | 'settingsKv' | 'feed' | 'write'
  >;
  readonly media: Pick<DriveMediaRepository, 'find'>;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly previewPath: (itemId: string, rev: number) => string;
  readonly languageDirectory: string;
  readonly icons: Pick<FolderIconRefresher, 'refreshRoot' | 'refreshFolder'>;
  readonly activity: Pick<DriveActivity, 'quiet'>;
  readonly log: Logger;
}

export type TextWork =
  | { readonly kind: 'document'; readonly item: FileItem }
  | { readonly kind: 'image'; readonly item: FileItem }
  | { readonly kind: 'unsupported'; readonly item: FileItem; readonly reason: string };

export interface TextBacklog {
  readonly work: readonly TextWork[];
  readonly files: number;
  readonly settled: number;
  readonly waiting: readonly string[];
}

type Folder = Extract<DriveItem, { readonly kind: 'folder' }>;

class Tally {
  readonly work: TextWork[] = [];
  readonly waiting: string[] = [];
  files = 0;
  settled = 0;

  constructor(private readonly env: Pick<TextEnvironment, 'store' | 'media'>) {}

  add(item: DriveItem): void {
    if (!isFile(item)) return;
    this.files += 1;
    if (this.env.store.driveItemText.find(item.id)?.rev === item.rev) {
      this.settled += 1;
      return;
    }
    const next = workFor(this.env.media, item);
    if (next === 'wait') this.waiting.push(item.id);
    else this.work.push(next);
  }

  backlog(): TextBacklog {
    return { work: this.work, files: this.files, settled: this.settled, waiting: this.waiting };
  }
}

function isFile(item: DriveItem): item is FileItem {
  return item.kind !== 'folder' && item.kind !== 'link' && item.kind !== 'special';
}

function workFor(media: TextEnvironment['media'], item: FileItem): TextWork | 'wait' {
  if (item.kind !== 'image') return { kind: 'document', item };
  const preview = media.find(item.id)?.preview_state;
  if (preview === 'ready') return { kind: 'image', item };
  if (preview === 'failed' || preview === 'unsupported') {
    return {
      kind: 'unsupported',
      item,
      reason: 'No preview could be made, so there is nothing to read.',
    };
  }
  return 'wait';
}

export function collectTextBacklog(
  env: Pick<TextEnvironment, 'store' | 'media'>,
  root: StoredDrive,
): TextBacklog {
  const tally = new Tally(env);
  const pending: (string | null)[] = [null];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    let after: string | null = null;
    do {
      const window = env.store.driveItems.children({
        rootId: root.id,
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
  readonly folders: readonly Folder[];
}

export function changesSince(
  env: Pick<TextEnvironment, 'store'>,
  rootId: string,
  after: number,
): Changes {
  const ids = new Set<string>();
  for (let cursor: number | null = after; cursor !== null;) {
    const window = env.store.driveFeed.sinceInRoot(rootId, cursor, WINDOW_ROWS);
    for (const row of window.rows) ids.add(row.itemId);
    cursor = window.next;
  }
  const items: DriveItem[] = [];
  const folders = new Map<string, Folder>();
  const folder = (id: string | null): void => {
    if (id === null || folders.has(id)) return;
    const found = env.store.driveItems.find(id, null);
    if (found?.kind === 'folder') folders.set(found.id, found);
  };
  for (const id of ids) {
    const item = env.store.driveItems.find(id, null);
    if (item === undefined) continue;
    items.push(item);
    if (item.kind === 'folder') folder(item.id);
    folder(item.parentId);
  }
  return { items, folders: [...folders.values()] };
}

function changedBacklog(
  env: Pick<TextEnvironment, 'store' | 'media'>,
  changes: Changes,
  waiting: readonly string[],
): TextBacklog {
  const tally = new Tally(env);
  const seen = new Set<string>();
  for (const item of changes.items) {
    seen.add(item.id);
    tally.add(item);
  }
  for (const id of waiting) {
    if (seen.has(id)) continue;
    const item = env.store.driveItems.find(id, null);
    if (item !== undefined) tally.add(item);
  }
  return tally.backlog();
}

function written(
  item: FileItem,
  source: 'document' | 'image',
  result: ContentResponse['result'],
): DriveItemTextWrite {
  const base = { itemId: item.id, rev: item.rev, source };
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

class TextRun {
  private settled: number;

  constructor(
    private readonly env: TextEnvironment,
    private readonly root: StoredDrive,
    private readonly backlog: TextBacklog,
  ) {
    this.settled = backlog.settled;
  }

  async run(signal: AbortSignal): Promise<void> {
    let worker = new ContentWorker(this.env.workerScript);
    try {
      for (const work of this.backlog.work) {
        await this.env.activity.quiet();
        if (signal.aborted) return;
        if (!(await this.one(worker, work))) {
          await worker.close();
          worker = new ContentWorker(this.env.workerScript);
        }
      }
    } finally {
      await worker.close();
    }
  }

  private async one(worker: ContentWorker, work: TextWork): Promise<boolean> {
    const { item } = work;
    if (work.kind === 'unsupported') {
      this.record(item, 'document', { state: 'unsupported', reason: work.reason });
      return true;
    }
    try {
      const response = await this.request(worker, work);
      this.record(item, work.kind, response.result);
      return true;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.env.log.warn('drive.text_failed', {
        rootId: this.root.id,
        relPath: item.relPath,
        reason,
      });
      this.record(item, work.kind, { state: 'failed', reason });
      return cause instanceof DrivePathError;
    }
  }

  private async request(
    worker: ContentWorker,
    work: Exclude<TextWork, { readonly kind: 'unsupported' }>,
  ): Promise<ContentResponse> {
    const { item } = work;
    if (work.kind === 'image') {
      return worker.request({
        kind: 'image',
        path: this.env.previewPath(item.id, item.rev),
        languages: [...readDriveSettings(this.env.store).ocrLanguages],
        languageDirectory: this.env.languageDirectory,
      });
    }
    const resolved = await resolveInRoot(this.root.path, item.relPath);
    return worker.request({
      kind: 'document',
      path: resolved.absolute,
      name: item.name,
      mime: item.mime,
    });
  }

  private record(
    item: FileItem,
    source: 'document' | 'image',
    result: ContentResponse['result'],
  ): void {
    const recorded = this.env.store.write(() => {
      const current = this.env.store.driveItems.find(item.id, null);
      if (current?.rev !== item.rev) return false;
      this.env.store.driveItemText.put(written(item, source, result));
      return true;
    });
    if (!recorded) return;
    this.settled += 1;
    this.env.store.feed.notice({
      type: 'drive_progress',
      rootId: this.root.id,
      phase: 'text',
      done: this.settled,
      total: this.backlog.files,
    });
  }
}

export class TextCursors {
  readonly icons = new Map<string, number>();
  readonly text = new Map<string, TextCursor>();

  forget(rootId: string): void {
    this.icons.delete(rootId);
    this.text.delete(rootId);
  }
}

interface TextCursor {
  readonly seq: number;
  readonly waiting: readonly string[];
}

async function refreshIcons(
  env: TextEnvironment,
  cursors: TextCursors,
  root: StoredDrive,
  signal: AbortSignal,
): Promise<void> {
  const mark = env.store.driveFeed.latestSeqInRoot(root.id);
  const from = cursors.icons.get(root.id);
  if (from === undefined) {
    await env.icons.refreshRoot(root, signal);
  } else {
    for (const folder of changesSince(env, root.id, from).folders) {
      if (signal.aborted) return;
      await env.icons.refreshFolder(root, folder);
    }
  }
  if (!signal.aborted) cursors.icons.set(root.id, mark);
}

async function textRoot(
  env: TextEnvironment,
  cursors: TextCursors,
  rootId: string,
  signal: AbortSignal,
): Promise<void> {
  const root = env.store.driveRoots.find(rootId);
  if (root === undefined) {
    env.log.warn('drive.text_skipped_root', { rootId, reason: 'no such drive' });
    return;
  }
  const settings = readDriveSettings(env.store);
  if (settings.indexingPaused) {
    env.log.info('drive.text_paused', { rootId });
    return;
  }
  if ((await env.availability(root)) !== 'online') return;
  await env.activity.quiet();
  await refreshIcons(env, cursors, root, signal);
  if (!settings.contentIndexing) {
    env.log.info('drive.text_off', { rootId });
    return;
  }
  const mark = env.store.driveFeed.latestSeqInRoot(rootId);
  const from = cursors.text.get(rootId);
  const backlog =
    from === undefined
      ? collectTextBacklog(env, root)
      : changedBacklog(env, changesSince(env, rootId, from.seq), from.waiting);
  const startedAt = performance.now();
  if (backlog.work.length > 0) await new TextRun(env, root, backlog).run(signal);
  if (signal.aborted) return;
  cursors.text.set(rootId, { seq: mark, waiting: backlog.waiting });
  if (backlog.work.length === 0) return;
  env.log.info('drive.text_done', {
    rootId,
    files: backlog.files,
    readNow: backlog.work.length,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export function textHandler(env: TextEnvironment, cursors: TextCursors): DriveJobHandlers['text'] {
  return (job, signal) => textRoot(env, cursors, job.rootId, signal);
}

export function textTrigger(
  feed: Pick<Store['feed'], 'subscribeNotices'>,
  enqueue: (rootId: string) => void,
): () => void {
  return feed.subscribeNotices((notice) => {
    if (notice.type !== 'drive_changed') return;
    for (const rootId of notice.rootIds) enqueue(rootId);
  });
}
