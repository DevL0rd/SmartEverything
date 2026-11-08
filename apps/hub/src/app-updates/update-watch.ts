import {
  APP_UPDATE_BROADCAST_INDEX_FILE,
  APP_UPDATE_TARGETED_INDEX_FILE,
  latestAppUpdate,
  type AppUpdateEntry,
  type AppUpdateNotice,
  type AppUpdateTarget,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { LiveHub } from '../server/live';
import { startDirectoryWatch, type DirectoryWatch } from './directory-watch';
import type { AppUpdateFolder } from './update-folder';

interface AudienceNotice {
  readonly notice: AppUpdateNotice;
  readonly clientId: string | undefined;
}

type Latest = ReadonlyMap<string, AudienceNotice>;

function latestPerTarget(entries: readonly AppUpdateEntry[]): Latest {
  const latest = new Map<string, AudienceNotice>();
  for (const { platform, channel, runtimeVersion, clientId } of entries) {
    const target: AppUpdateTarget = { platform, channel, runtimeVersion };
    const key = JSON.stringify({ ...target, clientId });
    if (latest.has(key)) continue;
    const found = latestAppUpdate(entries, { ...target, clientId });
    if (found !== null && found.clientId === clientId) {
      latest.set(key, { notice: { type: 'app_update', ...target, id: found.id }, clientId });
    }
  }
  return latest;
}

export class AppUpdateWatch {
  private watcher: DirectoryWatch | null = null;
  private latest: Latest = new Map();

  constructor(
    private readonly folder: AppUpdateFolder,
    private readonly live: Pick<LiveHub, 'announce' | 'toClient'>,
    private readonly log: Logger,
  ) {}

  async start(): Promise<void> {
    this.watcher = await startDirectoryWatch({
      directory: this.folder.directory,
      relevant: (name) =>
        name === APP_UPDATE_BROADCAST_INDEX_FILE || name === APP_UPDATE_TARGETED_INDEX_FILE,
      reload: (initial) => this.reload(!initial),
      log: this.log,
      reloadFailed: 'app_update.index_invalid',
      watchFailed: 'app_update.watch_failed',
    });
  }

  async stop(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = null;
    await watcher?.stop();
  }

  private async reload(announce: boolean): Promise<void> {
    const next = latestPerTarget(await this.folder.refresh());
    if (announce) this.announceChanges(next);
    this.latest = next;
  }

  private announceChanges(next: Latest): void {
    for (const [key, item] of next) {
      if (this.latest.get(key)?.notice.id !== item.notice.id) {
        this.send(item);
      }
    }
    for (const [key, item] of this.latest) {
      if (!next.has(key)) {
        this.send({ ...item, notice: { ...item.notice, id: null } });
      }
    }
  }

  private send({ notice, clientId }: AudienceNotice): void {
    if (clientId === undefined) this.live.announce(notice, 'everyone');
    else this.live.toClient(clientId, notice);
  }
}
