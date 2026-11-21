import type { DriveSettings } from '@smarteverything/domain';
import type { DriveActivity } from '../activity';
import type { Logger } from '@smarteverything/logging';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { Store } from '../../store/store';
import type { DriveJobHandlers } from '../jobs';
import { DrivePathError, resolveInRoot } from '../paths';
import type { RootAvailability } from '../root-marker';
import type {
  TextBacklog,
  TextFile,
  TextFolder,
  TextRecordInput,
  TextSinceInput,
} from '../units/text';
import type { ContentResponse } from './content-protocol';
import { ContentWorker } from './content-worker-client';
import type { FolderIconRefresher } from './folder-icon/refresh';

export interface TextEnvironment {
  readonly root: (rootId: string) => Promise<StoredDrive | undefined>;
  readonly settings: () => Promise<DriveSettings>;
  readonly latestSeqInRoot: (rootId: string) => Promise<number>;
  readonly backlog: (input: TextSinceInput) => Promise<TextBacklog>;
  readonly changedFolders: (input: {
    readonly rootId: string;
    readonly after: number;
  }) => Promise<readonly TextFolder[]>;
  readonly record: (input: TextRecordInput) => Promise<boolean>;
  readonly feed: Pick<Store['feed'], 'notice'>;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly icons: Pick<FolderIconRefresher, 'refreshRoot' | 'refreshFolder'>;
  readonly activity: Pick<DriveActivity, 'quiet'>;
  readonly log: Logger;
}

export function hostText(
  store: Pick<Store, 'host'>,
): Pick<TextEnvironment, 'root' | 'latestSeqInRoot' | 'backlog' | 'changedFolders' | 'record'> {
  const { host } = store;
  return {
    root: (rootId) => host.call('driveRoots', 'find', rootId),
    latestSeqInRoot: (rootId) => host.call('driveFeed', 'latestSeqInRoot', rootId),
    backlog: (input) => host.read('driveTextBacklog', input),
    changedFolders: (input) => host.read('driveTextFolders', input),
    record: (input) => host.write('driveTextRecord', input),
  };
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

  private async one(worker: ContentWorker, item: TextFile): Promise<boolean> {
    try {
      const response = await this.request(worker, item);
      await this.record(item, response.result);
      return true;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.env.log.warn('drive.text_failed', {
        rootId: this.root.id,
        relPath: item.relPath,
        reason,
      });
      await this.record(item, { state: 'failed', reason });
      return cause instanceof DrivePathError;
    }
  }

  private async request(worker: ContentWorker, item: TextFile): Promise<ContentResponse> {
    const resolved = await resolveInRoot(this.root.path, item.relPath);
    return worker.request({
      path: resolved.absolute,
      name: item.name,
      mime: item.mime,
    });
  }

  private async record(item: TextFile, result: ContentResponse['result']): Promise<void> {
    if (!(await this.env.record({ item, result }))) return;
    this.settled += 1;
    this.env.feed.notice({
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
  const mark = await env.latestSeqInRoot(root.id);
  const from = cursors.icons.get(root.id);
  if (from === undefined) {
    await env.icons.refreshRoot(root, signal);
  } else {
    for (const folder of await env.changedFolders({ rootId: root.id, after: from })) {
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
  const root = await env.root(rootId);
  if (root === undefined) {
    env.log.warn('drive.text_skipped_root', { rootId, reason: 'no such drive' });
    return;
  }
  const settings = await env.settings();
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
  const mark = await env.latestSeqInRoot(rootId);
  const backlog = await env.backlog({ rootId, after: cursors.text.get(rootId) });
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
