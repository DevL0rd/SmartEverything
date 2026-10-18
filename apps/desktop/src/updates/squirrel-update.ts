import { UpdateInstallError } from './update-errors.js';

export interface SquirrelUpdater {
  readonly setFeedURL: (options: { readonly url: string }) => void;
  readonly checkForUpdates: () => void;
  readonly quitAndInstall: () => void;
  readonly onceDownloaded: (listener: () => void) => void;
  readonly onceNotAvailable: (listener: () => void) => void;
  readonly onceFailed: (listener: (error: Error) => void) => void;
}

export function applySquirrelUpdate(
  updater: SquirrelUpdater,
  feedDirectory: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    updater.onceDownloaded(() => {
      updater.quitAndInstall();
      resolve();
    });
    updater.onceNotAvailable(() => {
      reject(new UpdateInstallError('checking the installer feed', 'it holds no newer version'));
    });
    updater.onceFailed((error) => {
      reject(new UpdateInstallError('running the installer', error.message));
    });
    updater.setFeedURL({ url: feedDirectory });
    updater.checkForUpdates();
  });
}
