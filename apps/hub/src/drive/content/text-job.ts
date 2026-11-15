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
    'driveRoots' | 'driveItems' | 'driveItemText' | 'settingsKv' | 'feed' | 'write'
  >;
  readonly media: Pick<DriveMediaRepository, 'find'>;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly previewPath: (itemId: string, rev: number) => string;
  readonly languageDirectory: string;
  readonly icons: Pick<FolderIconRefresher, 'refreshRoot'>;
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
  const work: TextWork[] = [];
  let files = 0;
  let settled = 0;
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
        if (item.kind === 'folder') {
          pending.push(item.id);
          continue;
        }
        if (!isFile(item)) continue;
        files += 1;
        if (env.store.driveItemText.find(item.id)?.rev === item.rev) {
          settled += 1;
          continue;
        }
        const next = workFor(env.media, item);
        if (next !== 'wait') work.push(next);
      }
      after = window.next;
    } while (after !== null);
  }
  return { work, files, settled };
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

async function textRoot(env: TextEnvironment, rootId: string, signal: AbortSignal): Promise<void> {
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
  await env.icons.refreshRoot(root, signal);
  if (!settings.contentIndexing) {
    env.log.info('drive.text_off', { rootId });
    return;
  }
  const backlog = collectTextBacklog(env, root);
  if (backlog.work.length === 0) return;
  const startedAt = performance.now();
  await new TextRun(env, root, backlog).run(signal);
  if (signal.aborted) return;
  env.log.info('drive.text_done', {
    rootId,
    files: backlog.files,
    readNow: backlog.work.length,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export function textHandler(env: TextEnvironment): DriveJobHandlers['text'] {
  return (job, signal) => textRoot(env, job.rootId, signal);
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
