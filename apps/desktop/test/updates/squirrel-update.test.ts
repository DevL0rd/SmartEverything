import { describe, expect, it } from 'vitest';
import { applySquirrelUpdate, type SquirrelUpdater } from '../../src/updates/squirrel-update.js';

function updater(fire: (listeners: Listeners) => void): {
  updater: SquirrelUpdater;
  calls: string[];
} {
  const calls: string[] = [];
  const listeners: Listeners = { downloaded: [], missing: [], failed: [] };
  return {
    calls,
    updater: {
      setFeedURL: (options): void => {
        calls.push(`feed ${options.url}`);
      },
      checkForUpdates: (): void => {
        calls.push('check');
        fire(listeners);
      },
      quitAndInstall: (): void => {
        calls.push('quit');
      },
      onceDownloaded: (listener): void => {
        listeners.downloaded.push(listener);
      },
      onceNotAvailable: (listener): void => {
        listeners.missing.push(listener);
      },
      onceFailed: (listener): void => {
        listeners.failed.push(listener);
      },
    },
  };
}

interface Listeners {
  readonly downloaded: (() => void)[];
  readonly missing: (() => void)[];
  readonly failed: ((error: Error) => void)[];
}

describe('applying a Windows update with Squirrel', () => {
  it('points Squirrel at the folder with the downloaded files and quits to install', async () => {
    const { updater: fake, calls } = updater((listeners) => {
      listeners.downloaded.forEach((listener) => {
        listener();
      });
    });
    await applySquirrelUpdate(fake, 'C:\\updates\\0.4.2');
    expect(calls).toStrictEqual(['feed C:\\updates\\0.4.2', 'check', 'quit']);
  });

  it('fails when the feed holds nothing newer', async () => {
    const { updater: fake } = updater((listeners) => {
      listeners.missing.forEach((listener) => {
        listener();
      });
    });
    await expect(applySquirrelUpdate(fake, 'C:\\updates')).rejects.toThrow(
      /holds no newer version/u,
    );
  });

  it('fails with the message Squirrel gives', async () => {
    const { updater: fake } = updater((listeners) => {
      listeners.failed.forEach((listener) => {
        listener(new Error('bad nupkg'));
      });
    });
    await expect(applySquirrelUpdate(fake, 'C:\\updates')).rejects.toThrow('bad nupkg');
  });
});
