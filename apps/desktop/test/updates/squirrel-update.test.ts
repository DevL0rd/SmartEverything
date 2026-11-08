import { describe, expect, it } from 'vitest';
import {
  applySquirrelUpdate,
  type SquirrelEvents,
  type SquirrelUpdater,
} from '../../src/updates/squirrel-update.js';

function updater(fire: (events: SquirrelEvents) => void): {
  updater: SquirrelUpdater;
  calls: string[];
  registered: () => number;
} {
  const calls: string[] = [];
  const attached = new Set<SquirrelEvents>();
  return {
    calls,
    registered: () => attached.size,
    updater: {
      setFeedURL: (options): void => {
        calls.push(`feed ${options.url}`);
      },
      checkForUpdates: (): void => {
        calls.push('check');
        [...attached].forEach(fire);
      },
      quitAndInstall: (): void => {
        calls.push('quit');
      },
      listen: (events) => {
        attached.add(events);
        return () => {
          attached.delete(events);
        };
      },
    },
  };
}

describe('applying a Windows update with Squirrel', () => {
  it('points Squirrel at the folder with the downloaded files and quits to install', async () => {
    const {
      updater: fake,
      calls,
      registered,
    } = updater((events) => {
      events.downloaded();
    });
    await applySquirrelUpdate(fake, 'C:\\updates\\0.4.2');
    expect(calls).toStrictEqual(['feed C:\\updates\\0.4.2', 'check', 'quit']);
    expect(registered()).toBe(0);
  });

  it('fails when the feed holds nothing newer and removes its listeners', async () => {
    const { updater: fake, registered } = updater((events) => {
      events.notAvailable();
    });
    await expect(applySquirrelUpdate(fake, 'C:\\updates')).rejects.toThrow(
      /holds no newer version/u,
    );
    expect(registered()).toBe(0);
  });

  it('fails with the message Squirrel gives and removes its listeners', async () => {
    const { updater: fake, registered } = updater((events) => {
      events.failed(new Error('bad nupkg'));
    });
    await expect(applySquirrelUpdate(fake, 'C:\\updates')).rejects.toThrow('bad nupkg');
    expect(registered()).toBe(0);
  });

  it('removes its listeners when starting the check throws', async () => {
    const { updater: fake, registered } = updater(() => undefined);
    const throwing: SquirrelUpdater = {
      ...fake,
      checkForUpdates: () => {
        throw new Error('no feed');
      },
    };
    await expect(applySquirrelUpdate(throwing, 'C:\\updates')).rejects.toThrow('no feed');
    expect(registered()).toBe(0);
  });

  it('installs once per attempt after an earlier attempt failed', async () => {
    let outcome: 'missing' | 'downloaded' = 'missing';
    const { updater: fake, calls } = updater((events) => {
      if (outcome === 'missing') events.notAvailable();
      else events.downloaded();
    });
    await expect(applySquirrelUpdate(fake, 'C:\\a')).rejects.toThrow();
    outcome = 'downloaded';
    await applySquirrelUpdate(fake, 'C:\\a');
    expect(calls.filter((call) => call === 'quit')).toHaveLength(1);
  });
});
