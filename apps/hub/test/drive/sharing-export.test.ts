import { createServer, type Server } from 'node:http';
import { ApiError, type ComputerNodeRow, type DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mayExport, type DriveActor, type ItemAccess } from '../../src/drive/access';
import { PosixError } from '../../src/drive/posix/errors';
import { DriveShares } from '../../src/drive/shares';
import { ExportGuard, VIEW_ONLY_REASON } from '../../src/drive/sharing/export-guard';
import type { DriveCaller } from '../../src/drive/service-write-support';
import { SyncBlockRoutes } from '../../src/drive/sync/server-blocks';
import { SyncTxns, type SyncEnv } from '../../src/drive/sync/server-ops';
import { handleRead } from '../../src/server/dav/read';
import type { DavDeps } from '../../src/server/dav/dav-auth';
import { driveDownloadLink, serveDriveFile, type DriveFiles } from '../../src/server/drive-files';
import { MediaLinks } from '../../src/server/media-links';
import { syncPosixOf } from './sync-posix';
import { openFsRig, NOW, type FsRig } from './fs-rig';

const NODE_TOKEN = `sen_${'m'.repeat(43)}`;
const BODY = 'view only words';

type Role = 'view' | 'edit';

interface Scenario {
  readonly name: string;
  readonly role: Role;
  readonly locked: boolean;
  readonly allowed: boolean;
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'a view grantee of a locked item', role: 'view', locked: true, allowed: false },
  {
    name: 'a view grantee of an item that is not locked',
    role: 'view',
    locked: false,
    allowed: true,
  },
  { name: 'an edit grantee of a locked item', role: 'edit', locked: true, allowed: true },
];

let rig: FsRig;
let folder: DriveItem;
let file: DriveItem;
let dest: DriveItem;
let server: Server;
let base = '';
let links: MediaLinks;
let files: DriveFiles;
let syncRoutes: SyncBlockRoutes;

function memberActor(): DriveActor {
  return { profileId: rig.memberId };
}

function memberCaller(): DriveCaller {
  return { profileId: rig.memberId, owner: false, via: 'app', deviceId: null };
}

function ownerCaller(): DriveCaller {
  return { profileId: rig.ownerId, owner: true, via: 'app', deviceId: null };
}

function node(): ComputerNodeRow {
  return {
    device_id: rig.memberNode,
    machine_id: '0'.repeat(32),
    hub_url: 'http://hub.local',
    paired_at: NOW.toISOString(),
    revoked_at: null,
  };
}

function prepare(role: Role, locked: boolean): void {
  const { store } = rig.opened;
  store.driveGrants.set(
    { itemId: folder.id, profileId: rig.memberId, role, expiresAt: null },
    rig.ownerId,
  );
  store.driveLocks.set(folder.id, rig.ownerId, locked);
}

async function refusedAs<T>(work: () => Promise<T> | T): Promise<ApiError | PosixError | null> {
  try {
    await work();
    return null;
  } catch (cause) {
    if (cause instanceof ApiError || cause instanceof PosixError) return cause;
    throw cause;
  }
}

async function copyRefused(action: 'copy' | 'keep'): Promise<boolean> {
  const result = await rig.service.change(
    memberCaller(),
    action === 'copy'
      ? { action: 'copy', itemIds: [file.id], toFolderId: dest.id }
      : { action: 'keep_source_item', itemId: file.id, toFolderId: dest.id },
  );
  const refused = result.failed.some((failure) => failure.reason.includes('view only'));
  expect(result.done.length + result.failed.length).toBe(1);
  return refused;
}

interface ExitPath {
  readonly name: string;
  readonly refused: () => Promise<boolean>;
}

const EXIT_PATHS: readonly ExitPath[] = [
  { name: 'copy in the write service', refused: () => copyRefused('copy') },
  { name: 'keep_source_item in the write service', refused: () => copyRefused('keep') },
  {
    name: 'the FUSE file API opening a file for reading',
    refused: async () =>
      (await refusedAs(() =>
        rig.readable({ profileId: rig.memberId, nodeId: rig.memberNode }, rig.mine, {
          itemId: file.id,
          baseId: folder.id,
        }),
      )) !== null,
  },
  {
    name: 'a download link',
    refused: () => Promise.resolve(driveDownloadLink(files, memberActor(), file.id) === null),
  },
  {
    name: 'the raw file route read by a computer',
    refused: async (): Promise<boolean> => {
      const response = await fetch(`${base}/media/drive/${file.id}/file`, {
        headers: { authorization: `Bearer ${NODE_TOKEN}` },
      });
      await response.arrayBuffer();
      return refusedStatus(response.status);
    },
  },
  {
    name: 'a signed download link opened as an attachment',
    refused: async (): Promise<boolean> => {
      const link = driveDownloadLink(files, memberActor(), file.id);
      if (link === null) return true;
      const response = await fetch(`${base}${link.url}`);
      await response.arrayBuffer();
      return !(response.headers.get('content-disposition') ?? '').startsWith('attachment');
    },
  },
  {
    name: 'the sync pull of a block',
    refused: async (): Promise<boolean> => {
      const response = await fetch(`${base}/sync/blocks/${rig.mine.id}/${file.id}/0`);
      await response.arrayBuffer();
      return refusedStatus(response.status);
    },
  },
  {
    name: 'WebDAV GET',
    refused: async (): Promise<boolean> => {
      const response = await fetch(`${base}/dav/${rig.mine.id}/${folder.name}/${file.name}`, {
        headers: { authorization: `Bearer ${NODE_TOKEN}` },
      });
      await response.arrayBuffer();
      return refusedStatus(response.status);
    },
  },
];

function syncEnv(): SyncEnv {
  return {
    ...rig.changeEnv(),
    store: rig.opened.store,
    space: () => Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    authenticate: () => ({
      deviceId: rig.memberNode,
      profileId: rig.memberId,
      actor: memberActor(),
    }),
    posix: syncPosixOf(rig.opened.store, () => NOW),
  };
}

function refusedStatus(status: number): boolean {
  if (status === 403) return true;
  if (status === 200) return false;
  throw new Error(`The route answered ${String(status)}, which is neither a refusal nor the file.`);
}

function davDeps(): DavDeps {
  const { store } = rig.opened;
  return {
    store,
    env: rig.changeEnv(),
    guard: {
      status: (profileId) => store.driveQuotas.status(profileId),
      space: () => Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    nodes: files.nodes,
  };
}

beforeEach(async () => {
  rig = await openFsRig();
  folder = await rig.seedFolder(rig.mine, 'proj');
  file = await rig.seedFile(rig.mine, 'proj/a.txt', BODY);
  dest = await rig.seedFolder(rig.theirs, 'dest');
  links = new MediaLinks(() => NOW);
  files = {
    store: rig.opened.store,
    links,
    nodes: {
      authenticate: (token): ComputerNodeRow => {
        if (token !== NODE_TOKEN) throw new ApiError('unauthorized', 'unknown node token');
        return node();
      },
      actorOf: (): DriveActor => memberActor(),
    },
    now: (): Date => NOW,
  };
  syncRoutes = new SyncBlockRoutes(syncEnv(), new SyncTxns());
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://hub');
    const [, , rootId = '', itemId = '', index = ''] = url.pathname.split('/').slice(1);
    const run = url.pathname.startsWith('/dav/')
      ? handleRead(davDeps(), { request, response })
      : url.pathname.startsWith('/sync/blocks/')
        ? syncRoutes.get(request, response, { rootId, itemId, index })
        : serveDriveFile(files, { request, response, url }, url.pathname.split('/')[3] ?? '');
    run.catch((cause: unknown) => {
      response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server has no port.');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  await rig.opened.close();
});

describe('the one export rule', () => {
  it.each<readonly [ItemAccess, boolean, boolean]>([
    ['own', true, true],
    ['shared', true, true],
    ['edit', true, true],
    ['view', true, false],
    ['view', false, true],
    ['none', false, true],
  ])('%s access to an item that is locked %s may export %s', (access, locked, expected) => {
    expect(mayExport(access, locked)).toBe(expected);
  });

  it('marks an item inside a locked folder as locked for everyone who reads it', () => {
    prepare('view', true);
    const inside = rig.opened.store.driveItems.byId(file.id, rig.memberId);
    expect(inside.locked).toBe(true);
    expect(rig.opened.store.driveItems.byId(file.id, rig.ownerId).locked).toBe(true);
    expect(inside.lockedHere).toBe(false);
    expect(rig.opened.store.driveItems.byId(folder.id, rig.ownerId).lockedHere).toBe(true);
    expect(new ExportGuard(rig.opened.store).may(memberActor(), inside)).toBe(false);
    expect(new ExportGuard(rig.opened.store).may({ profileId: rig.ownerId }, inside)).toBe(true);
  });
});

describe.each(EXIT_PATHS)('the export rule on $name', (path) => {
  it.each(SCENARIOS)('$name: refused is $allowed inverted', async (scenario) => {
    prepare(scenario.role, scenario.locked);
    expect(await path.refused()).toBe(!scenario.allowed);
  });

  it('lets the owner through whether or not the item is locked', async () => {
    rig.opened.store.driveLocks.set(folder.id, rig.ownerId, true);
    if (path.name.startsWith('copy') || path.name.startsWith('keep_source')) {
      const result = await rig.service.change(
        ownerCaller(),
        path.name.startsWith('copy')
          ? { action: 'copy', itemIds: [file.id], toFolderId: folder.id }
          : { action: 'keep_source_item', itemId: file.id, toFolderId: folder.id },
      );
      expect(result.failed).toEqual([]);
      return;
    }
    const ownerOnly = await refusedAs(() =>
      rig.readable({ profileId: rig.ownerId, nodeId: rig.ownerNode }, rig.mine, {
        itemId: file.id,
      }),
    );
    expect(ownerOnly).toBeNull();
  });
});

describe('public links on a view only item', () => {
  function shares(): DriveShares {
    return new DriveShares({
      store: rig.opened.store,
      origin: () => ({ url: 'http://hub.local', public: false }),
      now: () => NOW,
    });
  }

  it('allows only view links while the item is locked', async () => {
    rig.opened.store.driveLocks.set(folder.id, rig.ownerId, true);
    const refused = await refusedAs(() =>
      shares().create(
        { profileId: rig.ownerId, owner: true },
        { itemId: file.id, permission: 'download', expiresAt: null, password: null },
      ),
    );
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused instanceof ApiError && refused.reason).toBe(VIEW_ONLY_REASON);
    const view = await shares().create(
      { profileId: rig.ownerId, owner: true },
      { itemId: file.id, permission: 'view', expiresAt: null, password: null },
    );
    expect(view.share.permission).toBe('view');
  });

  it('allows download links again once the lock is lifted', async () => {
    rig.opened.store.driveLocks.set(folder.id, rig.ownerId, true);
    rig.opened.store.driveLocks.set(folder.id, rig.ownerId, false);
    const link = await shares().create(
      { profileId: rig.ownerId, owner: true },
      { itemId: file.id, permission: 'download', expiresAt: null, password: null },
    );
    expect(link.share.permission).toBe('download');
  });
});
