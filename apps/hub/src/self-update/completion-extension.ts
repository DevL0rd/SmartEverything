import { HUB_UPDATE_LEDGER_FILE } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { watch, type FSWatcher } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../extensions';
import { reconcileHubUpdateNotes } from './completion';
import { hubUpdateStatusOf, readHubUpdateLedger } from './recovery';

const log = new Logger('hub.self-update');

async function watchCompletions(directory: string, reload: () => void): Promise<FSWatcher | null> {
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const watcher = watch(directory, (_event, filename) => {
      if (filename === HUB_UPDATE_LEDGER_FILE || filename === null) reload();
    });
    watcher.on('error', (cause) => {
      log.error('update_completion.watch_failed', cause);
    });
    return watcher;
  } catch (cause) {
    log.error('update_completion.watch_failed', cause);
    return null;
  }
}

export async function startHubUpdateCompletion(
  context: Pick<ExtensionContext, 'store' | 'layout'> & {
    readonly live: Pick<ExtensionContext['live'], 'announce'>;
  },
): Promise<RunningExtension> {
  let previousStatus: string | undefined;
  let pending = Promise.resolve();
  function reload(announce: boolean): void {
    pending = pending
      .then(async () => {
        const ledger = await readHubUpdateLedger(context.layout);
        const status = JSON.stringify(hubUpdateStatusOf(ledger.releases.at(-1)));
        if (announce && status !== previousStatus)
          context.live.announce({ type: 'hub_update_status_changed' }, 'owners');
        previousStatus = status;
        reconcileHubUpdateNotes(context.store, ledger);
      })
      .catch((cause: unknown) => {
        log.error('update_completion.read_failed', cause);
      });
  }
  const watcher = await watchCompletions(context.layout.system.updates.selfUpdate, () => {
    reload(true);
  });
  reload(false);
  await pending;
  return {
    endpoints: {},
    routes: [],
    stop: async (): Promise<void> => {
      watcher?.close();
      await pending;
    },
  };
}

export function hubUpdateCompletionExtension(): ServerExtension {
  return startHubUpdateCompletion;
}
