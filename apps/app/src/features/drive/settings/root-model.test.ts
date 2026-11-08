import { describe, expect, it } from 'vitest';
import { DRIVE_ROOT, type DriveRoot } from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import { bytes } from '../../../format/number';
import { ROOT_ID, rootRow } from '../../nas/data/fixtures';
import {
  REMOVE_ROOT,
  accessChangeOf,
  removeRootConfirmed,
  removeRootRequestOf,
  rootAbilitiesOf,
  rootIdOf,
  rootSubtitleOf,
  rootWatchLineOf,
  syncValueOf,
  type RemoveRootSteps,
} from './root-model';

const BASE: Readonly<Record<string, unknown>> = { ...rootRow(ROOT_ID, 'ready') };

function root(patch: Partial<Record<string, unknown>> = {}): DriveRoot {
  const virtual = patch['kind'] === 'cameras';
  return DRIVE_ROOT.parse({
    ...Object.fromEntries(Object.entries(BASE).filter(([key]) => !virtual || key !== 'volume')),
    label: 'Projects',
    items: 12_804,
    bytes: 370_000_000_000,
    ...patch,
  });
}

const CAMERAS = {
  kind: 'cameras',
  path: null,
  readOnly: true,
  versions: false,
  synced: false,
  sync: null,
};

interface Seen {
  readonly asked: ConfirmRequest[];
  readonly removed: string[];
  left: number;
}

function stepsOf(
  accept: boolean,
  failure: Error | null = null,
): { readonly seen: Seen; readonly run: RemoveRootSteps } {
  const seen: Seen = { asked: [], removed: [], left: 0 };
  return {
    seen,
    run: {
      confirm: (request): Promise<boolean> => {
        seen.asked.push(request);
        return Promise.resolve(accept);
      },
      remove: (rootId): Promise<null> => {
        seen.removed.push(rootId);
        return failure === null ? Promise.resolve(null) : Promise.reject(failure);
      },
      leave: (): void => {
        seen.left += 1;
      },
    },
  };
}

describe('rootIdOf', () => {
  it('reads the folder id from the settings path drive/roots/<id>', () => {
    expect(rootIdOf({ page: ['drive', 'roots', ROOT_ID] })).toBe(ROOT_ID);
  });

  it('refuses a path without a folder id', () => {
    expect(rootIdOf({ page: ['drive', 'roots', 'nope'] })).toBeNull();
    expect(rootIdOf({})).toBeNull();
  });
});

describe('rootAbilitiesOf', () => {
  it('lets the owner change and remove a disk folder', () => {
    expect(rootAbilitiesOf(root(), true)).toEqual({
      change: true,
      access: true,
      remove: true,
      placements: true,
    });
  });

  it('keeps the hub folder writable and in the library', () => {
    const can = rootAbilitiesOf(root({ kind: 'managed' }), true);
    expect(can.change).toBe(true);
    expect(can.access).toBe(false);
    expect(can.remove).toBe(false);
  });

  it('shows a folder SmartEverything fills itself read only, with no computers', () => {
    expect(rootAbilitiesOf(root(CAMERAS), true)).toEqual({
      change: false,
      access: false,
      remove: false,
      placements: false,
    });
  });

  it('shows members and an offline hub the settings without changing them', () => {
    const can = rootAbilitiesOf(root(), false);
    expect(can.change || can.access || can.remove).toBe(false);
    expect(can.placements).toBe(true);
  });
});

describe('accessChangeOf', () => {
  it('turns versions off with view only, since the hub never writes there', () => {
    expect(accessChangeOf('view')).toEqual({ readOnly: true, versions: false });
    expect(accessChangeOf('edit')).toEqual({ readOnly: false });
  });
});

describe('rootWatchLineOf', () => {
  it('counts the watched files and says the folder is watched', () => {
    expect(rootWatchLineOf(root(), 'watching')).toEqual({
      text: '12,804 files · Watching for changes',
      tone: 'positive',
    });
  });

  it('carries the inotify note when the hub cannot watch', () => {
    const line = rootWatchLineOf(root(), 'unavailable');
    expect(line.tone).toBe('warning');
    expect(line.text).toContain('inotify');
  });

  it('puts the folder state first while it is offline', () => {
    const line = rootWatchLineOf(
      root({ state: 'offline', stateReason: 'Disk unplugged' }),
      'unavailable',
    );
    expect(line).toEqual({ text: '12,804 files · Offline · Disk unplugged', tone: 'critical' });
  });
});

describe('rootSubtitleOf and syncValueOf', () => {
  it('shows the hub path, size and file count', () => {
    expect(rootSubtitleOf(root())).toBe(`/data/photos · ${bytes(370_000_000_000)} · 12,804 files`);
  });

  it('says whether the folder is synced', () => {
    expect(syncValueOf(root())).toBe('Off');
    expect(
      syncValueOf(
        root({ synced: true, sync: { ignorePatterns: [], conflictCopies: true, clients: [] } }),
      ),
    ).toBe('On');
  });
});

describe('removeRootConfirmed', () => {
  it('asks with a destructive confirm that says the files stay on the disk', () => {
    const request = removeRootRequestOf(root());
    expect(request.title).toBe('Remove Projects from the library?');
    expect(request.tone).toBe('destructive');
    expect(request.confirmLabel).toBe(REMOVE_ROOT);
    expect(request.body).toContain('The files stay on the disk.');
  });

  it('removes the folder and leaves the page once confirmed', async () => {
    const steps = stepsOf(true);
    await expect(removeRootConfirmed(root(), steps.run)).resolves.toBe(true);
    expect(steps.seen.asked).toHaveLength(1);
    expect(steps.seen.removed).toEqual([ROOT_ID]);
    expect(steps.seen.left).toBe(1);
  });

  it('does nothing when the confirm is cancelled', async () => {
    const steps = stepsOf(false);
    await expect(removeRootConfirmed(root(), steps.run)).resolves.toBe(false);
    expect(steps.seen.removed).toEqual([]);
    expect(steps.seen.left).toBe(0);
  });

  it('stays on the page when the hub refuses', async () => {
    const steps = stepsOf(true, new Error('refused'));
    await expect(removeRootConfirmed(root(), steps.run)).rejects.toThrow('refused');
    expect(steps.seen.left).toBe(0);
  });
});
