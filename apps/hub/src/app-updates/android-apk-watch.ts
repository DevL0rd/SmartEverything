import type { AppUpdateNotice } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { readdir } from 'node:fs/promises';
import type { LiveHub } from '../server/live';
import type { AndroidApkFolder, AndroidApkScope } from './android-apk-folder';
import { startDirectoryWatch } from './directory-watch';

interface Announced {
  readonly notice: AppUpdateNotice;
  readonly clientId: string | null;
}

type Latest = ReadonlyMap<string, Announced>;

async function latestOf(
  folder: AndroidApkFolder,
  scope: AndroidApkScope,
): Promise<Announced | null> {
  const release = await folder.releaseFor(scope.channel, scope.clientId);
  if (release === null) return null;
  return {
    clientId: scope.clientId,
    notice: {
      type: 'app_update',
      platform: 'android',
      channel: scope.channel,
      runtimeVersion: release.runtimeVersion,
      id: release.id,
    },
  };
}

function send(live: Pick<LiveHub, 'announce' | 'toClient'>, { notice, clientId }: Announced): void {
  if (clientId === null) live.announce(notice, 'everyone');
  else live.toClient(clientId, notice);
}

export async function watchAndroidApks(
  folder: AndroidApkFolder,
  live: Pick<LiveHub, 'announce' | 'toClient'>,
  log: Logger,
): Promise<() => Promise<void>> {
  let latest: Latest = new Map();
  const read = async (previous: Latest): Promise<Map<string, Announced>> => {
    const next = new Map<string, Announced>();
    for (const name of await readdir(folder.directory)) {
      const scope = folder.scopeOfIndexFile(name);
      if (scope === null) continue;
      try {
        const found = await latestOf(folder, scope);
        if (found !== null) next.set(name, found);
      } catch (cause) {
        log.error('android_apk.index_invalid', cause, { name });
        const kept = previous.get(name);
        if (kept !== undefined) next.set(name, kept);
      }
    }
    return next;
  };
  const watch = await startDirectoryWatch({
    directory: folder.directory,
    mode: 0o700,
    relevant: (name) => folder.scopeOfIndexFile(name) !== null,
    reload: async (initial) => {
      const next = await read(latest);
      if (!initial) {
        for (const [name, item] of next) {
          if (latest.get(name)?.notice.id !== item.notice.id) send(live, item);
        }
        for (const [name, item] of latest) {
          if (!next.has(name)) send(live, { ...item, notice: { ...item.notice, id: null } });
        }
      }
      latest = next;
    },
    log,
    reloadFailed: 'android_apk.notice_failed',
    watchFailed: 'android_apk.watch_failed',
  });
  return () => watch.stop();
}
