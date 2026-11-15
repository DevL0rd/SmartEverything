import { describe, expect, it } from 'vitest';
import type { DriveShortcut } from '@smarteverything/domain';
import {
  AT,
  FOLDER_ID,
  MEMBER_ID,
  ROOT_ID,
  documentFixture,
  folderFixture,
} from '../data/fixtures';
import {
  closeDriveRequest,
  driveActionsOf,
  driveRequests,
  type DriveActionEnv,
  type DriveRequest,
} from './drive-actions';
import { driveNodeOf, shortcutNodeOf, trashNodeOf } from './drive-node';
import { OWNER_RIGHTS, idOf, worldContext } from './drive-fixture';

interface Rig {
  readonly env: DriveActionEnv;
  readonly requests: DriveRequest[];
  readonly calls: string[];
}

function rig(patch: Partial<DriveActionEnv> = {}): Rig {
  const requests: DriveRequest[] = [];
  const calls: string[] = [];
  const env: DriveActionEnv = {
    online: true,
    phone: true,
    clientId: 'client',
    setOffline: (body) => {
      calls.push(`offline ${body.itemId} ${String(body.on)}`);
      return Promise.resolve(null);
    },
    setLock: (body) => {
      calls.push(`lock ${body.itemId} ${String(body.locked)}`);
      return Promise.resolve(null);
    },
    removeShortcut: (id) => {
      calls.push(`remove ${id}`);
      return Promise.resolve(null);
    },
    refresh: () => {
      calls.push('refresh');
    },
    request: (request) => {
      requests.push(request);
    },
    ...patch,
  };
  return { env, requests, calls };
}

const context = worldContext();
const FILE = driveNodeOf(documentFixture({ id: idOf(1), name: 'Plan.pdf' }), context);
const FOLDER = driveNodeOf(folderFixture({ id: idOf(2), name: 'Docs' }), context);
const PINNED = driveNodeOf(
  documentFixture({ id: idOf(3), locked: true }),
  worldContext({
    offline: new Map([[idOf(3), 'ready']]),
  }),
);

const ids = (specs: readonly { readonly id: string }[]): readonly string[] =>
  specs.map((spec) => spec.id);

describe('source actions', () => {
  it('offers a file the owner’s actions', () => {
    expect(ids(driveActionsOf([FILE], rig().env))).toEqual([
      'share',
      'shortcut',
      'offline',
      'lock',
      'comments',
    ]);
  });

  it('adds the folder colour and file requests on a folder', () => {
    expect(ids(driveActionsOf([FOLDER], rig().env))).toEqual([
      'share',
      'shortcut',
      'colour',
      'offline',
      'lock',
      'comments',
      'fileRequest',
    ]);
  });

  it('leaves out offline pins without the phone link and everything while offline', () => {
    expect(ids(driveActionsOf([FILE], rig({ phone: false }).env))).not.toContain('offline');
    expect(driveActionsOf([FILE], rig({ online: false }).env)).toEqual([]);
  });

  it('keeps only the bulk actions for several items', () => {
    const many = driveActionsOf([FILE, FOLDER], rig().env).filter((spec) => spec.many);
    expect(ids(many)).toEqual(['offline', 'lock']);
  });

  it('offers nothing for trash entries or for an item the person may not share', () => {
    const entry = trashNodeOf(
      {
        itemId: idOf(9),
        rootId: ROOT_ID,
        name: 'gone',
        originalRelPath: 'gone',
        trashRelPath: 'gone',
        isFolder: false,
        bytes: 1,
        deletedAt: AT,
        purgeAt: AT,
        deletedBy: null,
        addedByProfileId: null,
      },
      OWNER_RIGHTS,
    );
    expect(driveActionsOf([entry], rig().env)).toEqual([]);
    const viewing = driveNodeOf(
      documentFixture({ id: idOf(4), rootId: idOf(990) }),
      worldContext({ roots: [], shared: [] }),
    );
    expect(ids(driveActionsOf([viewing], rig().env))).toEqual(['shortcut', 'offline', 'comments']);
  });
});

describe('running source actions', () => {
  it('asks the host for a sheet instead of building one', () => {
    const { env, requests } = rig();
    const share = driveActionsOf([FILE], env).find((spec) => spec.id === 'share');
    share?.run([FILE]);
    expect(requests).toEqual([{ kind: 'share', nodes: [FILE] }]);
  });

  it('toggles view only and refreshes the listing', async () => {
    const { env, calls } = rig();
    const lock = driveActionsOf([FILE], env).find((spec) => spec.id === 'lock');
    expect(lock?.label).toBe('Make view only');
    lock?.run([FILE]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([`lock ${idOf(1)} true`, 'refresh']);
    const locked = driveActionsOf([PINNED], env).find((spec) => spec.id === 'lock');
    expect(locked?.label).toBe('Allow downloads');
  });

  it('pins and unpins for this phone', async () => {
    const { env, calls } = rig();
    const pin = driveActionsOf([FILE], env).find((spec) => spec.id === 'offline');
    expect(pin?.label).toBe('Make available offline');
    pin?.run([FILE]);
    const unpin = driveActionsOf([PINNED], env).find((spec) => spec.id === 'online');
    expect(unpin?.label).toBe('Remove from this phone');
    unpin?.run([PINNED]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([`offline ${idOf(1)} true`, `offline ${idOf(3)} false`]);
  });
});

describe('shortcut actions', () => {
  const shortcut: DriveShortcut = {
    id: idOf(60),
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    name: 'Alias',
    createdBy: MEMBER_ID,
    createdAt: AT,
    target: { state: 'available', item: documentFixture({ id: idOf(61) }) },
  };

  it('removes shortcuts instead of trashing what they point at', async () => {
    const { env, calls } = rig();
    const node = shortcutNodeOf(shortcut, context);
    const specs = driveActionsOf([node], env);
    expect(ids(specs)).toEqual(['removeShortcut']);
    specs[0]?.run([node]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([`remove ${idOf(60)}`, 'refresh']);
  });

  it('does not mix shortcuts with items', () => {
    const node = shortcutNodeOf(shortcut, context);
    expect(driveActionsOf([node, FILE], rig().env)).toEqual([]);
  });
});

describe('the request store', () => {
  it('holds one request until it is closed', () => {
    driveRequests.set({ kind: 'colour', nodes: [FOLDER] });
    expect(driveRequests.get()?.kind).toBe('colour');
    closeDriveRequest();
    expect(driveRequests.get()).toBeNull();
  });
});
