import type { DriveActivity } from '../activity';
import type { DriveItem } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
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
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly icons: Pick<FolderIconRefresher, 'refreshRoot' | 'refreshFolder'>;
  readonly activity: Pick<DriveActivity, 'quiet'>;
  readonly log: Logger;
}

export interface TextBacklog {
  readonly work: readonly FileItem[];
  readonly files: number;
  readonly settled: number;
}

type Folder = Extract<DriveItem, { readonly kind: 'folder' }>;

class Tally {
  readonly work: FileItem[] = [];
  files = 0;
  settled = 0;

  constructor(private readonly env: Pick<TextEnvironment, 'store'>) {}

  add(item: DriveItem): void {
    if (!isDocument(item)) return;
    this.files += 1;
    if (this.env.store.driveItemText.find(item.id)?.rev === item.rev) {
      this.settled += 1;
      return;
    }
    this.work.push(item);
  }

  backlog(): TextBacklog {
    return { work: this.work, files: this.files, settled: this.settled };
  }
}

function isDocument(item: DriveItem): item is FileItem {
  return (
    item.kind !== 'folder' &&
    item.kind !== 'link' &&
    item.kind !== 'special' &&
    item.kind !== 'image' &&
    item.kind !== 'video'
  );
}

export function collectTextBacklog(
  env: Pick<TextEnvironment, 'store'>,
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

function changedBacklog(env: Pick<TextEnvironment, 'store'>, changes: Changes): TextBacklog {
  const tally = new Tally(env);
  for (const item of changes.items) tally.add(item);
  return tally.backlog();
}

function written(item: FileItem, result: ContentResponse['result']): DriveItemTextWrite {
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

  private async one(worker: ContentWorker, item: FileItem): Promise<boolean> {
    try {
      const response = await this.request(worker, item);
      this.record(item, response.result);
      return true;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.env.log.warn('drive.text_failed', {
        rootId: this.root.id,
        relPath: item.relPath,
        reason,
      });
      this.record(item, { state: 'failed', reason });
      return cause instanceof DrivePathError;
    }
  }

  private async request(worker: ContentWorker, item: FileItem): Promise<ContentResponse> {
    const resolved = await resolveInRoot(this.root.path, item.relPath);
    return worker.request({
      path: resolved.absolute,
      name: item.name,
      mime: item.mime,
    });
  }

  private record(item: FileItem, result: ContentResponse['result']): void {
    const recorded = this.env.store.write(() => {
      const current = this.env.store.driveItems.find(item.id, null);
      if (current?.rev !== item.rev) return false;
      this.env.store.driveItemText.put(written(item, result));
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
  readonly text = new Map<string, number>();

  forget(rootId: string): void {
    this.icons.delete(rootId);
    this.text.delete(rootId);
  }
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
      : changedBacklog(env, changesSince(env, rootId, from));
  const startedAt = performance.now();
  if (backlog.work.length > 0) await new TextRun(env, root, backlog).run(signal);
  if (signal.aborted) return;
  cursors.text.set(rootId, mark);
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
