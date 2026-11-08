import { messageOf } from '@smarteverything/logging';
import { UpdateInstallError } from './update-errors.js';

export interface SquirrelEvents {
  readonly downloaded: () => void;
  readonly notAvailable: () => void;
  readonly failed: (error: Error) => void;
}

export interface SquirrelUpdater {
  readonly setFeedURL: (options: { readonly url: string }) => void;
  readonly checkForUpdates: () => void;
  readonly quitAndInstall: () => void;
  readonly listen: (events: SquirrelEvents) => () => void;
}

export function applySquirrelUpdate(
  updater: SquirrelUpdater,
  feedDirectory: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const stop = updater.listen({
      downloaded: () => {
        stop();
        updater.quitAndInstall();
        resolve();
      },
      notAvailable: () => {
        stop();
        reject(new UpdateInstallError('checking the installer feed', 'it holds no newer version'));
      },
      failed: (error) => {
        stop();
        reject(new UpdateInstallError('running the installer', error.message));
      },
    });
    try {
      updater.setFeedURL({ url: feedDirectory });
      updater.checkForUpdates();
    } catch (cause) {
      stop();
      reject(new UpdateInstallError('starting the installer check', messageOf(cause)));
    }
  });
}
