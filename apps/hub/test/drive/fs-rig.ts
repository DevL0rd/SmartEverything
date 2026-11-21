import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  type DriveBackupReport,
  type DriveDataSpace,
  type DriveItem,
  type DriveScrubState,
} from '@smarteverything/domain';
import { DriveAlbums } from '../../src/drive/service-write-albums';
import { commitContent, folderDraft, recordItem } from '../../src/drive/changes';
import { identityOf, isoOf } from '../../src/drive/change-rows';
import type { ConflictEnv } from '../../src/drive/conflicts';
import { PosixScope, type PosixEnv } from '../../src/drive/posix/env';
import type { OpenTarget } from '../../src/drive/posix/open';
import { DrivePosix } from '../../src/drive/posix/service';
import { hostQuotaSource } from '../../src/drive/quotas';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveWriteService } from '../../src/drive/service-write';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { DriveShares } from '../../src/drive/shares';
import { ensureDrives } from '../../src/drive/spaces';
import { personalDrive, sharedDrive } from '../../src/drive/units/spaces';
import { fileEnv, nodeFiles, stageBytes } from '../../src/drive/versions';
import type { StoredDrive } from '../../src/store/repositories/drive-roots';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { pairComputer, status } from './placement-fixture';

export const NOW = new Date('2026-11-07T00:00:00.000Z');

export interface FsRig {
  readonly opened: TestStore;
  readonly ownerId: string;
  readonly memberId: string;
  readonly ownerNode: string;
  readonly memberNode: string;
  readonly shared: StoredDrive;
  readonly mine: StoredDrive;
  readonly theirs: StoredDrive;
  readonly service: DriveWriteService;
  readonly posix: DrivePosix;
  readonly changeEnv: () => ConflictEnv;
  readonly readable: (
    reader: { readonly profileId: string; readonly nodeId: string },
    root: StoredDrive,
    target: { readonly itemId: string; readonly baseId?: string | undefined },
  ) => Promise<OpenTarget>;
  readonly mount: (nodeId: string, profileId: string, root: StoredDrive, base?: string) => void;
  readonly seedFolder: (root: StoredDrive, relPath: string) => Promise<DriveItem>;
  readonly seedFile: (root: StoredDrive, relPath: string, text: string) => Promise<DriveItem>;
}

function envOf(opened: TestStore): () => ConflictEnv {
  return (): ConflictEnv => ({
    ...fileEnv(opened.store, testLogger('drive'), () => NOW),
    store: opened.store,
    purge: { rearm: (): void => undefined },
  });
}

function serviceOf(opened: TestStore, read: DriveReadService): DriveWriteService {
  const { store } = opened;
  return new DriveWriteService({
    env: envOf(opened)(),
    store,
    read,
    albums: new DriveAlbums(store),
    shares: new DriveShares({
      store,
      origin: (): { url: string; public: boolean } => ({ url: 'http://hub.local', public: false }),
      now: (): Date => NOW,
    }),
    scrub: {
      start: (): Promise<DriveScrubState> =>
        Promise.resolve({ state: 'idle', lastFinishedAt: null, corrupt: 0 }),
    },
    backups: {
      report: (input): Promise<DriveBackupReport> => store.host.write('driveBackupReport', input),
    },
    guard: {
      status: hostQuotaSource(store),
      space: (): Promise<Pick<DriveDataSpace, 'totalBytes' | 'freeBytes'>> =>
        Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    scan: (): void => undefined,
    lanes: new DriveRootLanes(),
  });
}

function mountingOf(store: TestStore['store']): FsRig['mount'] {
  let mounts = 0;
  return (nodeId, profileId, root, base) => {
    mounts += 1;
    store.drivePlacements.insert({
      id: randomUUID(),
      deviceId: nodeId,
      rootId: root.id,
      folderItemId: base ?? null,
      mode: 'mounted',
      localPath: null,
      mountName: `drive-${String(mounts)}`,
      enabled: true,
      createdBy: profileId,
      status: status(),
    });
  };
}

type Seeding = Pick<FsRig, 'seedFolder' | 'seedFile'>;

function seedingOf(opened: TestStore, ownerId: string, changeEnv: () => ConflictEnv): Seeding {
  const { store } = opened;
  const actor = { actorProfileId: ownerId, via: 'app', deviceId: null } as const;
  return {
    seedFolder: async (root, relPath): Promise<DriveItem> => {
      const path = join(root.path, relPath);
      await mkdir(path, { recursive: true });
      const stamp = await nodeFiles.stamp(path);
      if (stamp === null) throw new Error('missing');
      const slash = relPath.lastIndexOf('/');
      const parent =
        slash < 0 ? undefined : store.driveItems.byPath(root.id, relPath.slice(0, slash), null);
      const draft = folderDraft(
        {
          rootId: root.id,
          parentId: parent?.id ?? null,
          relPath,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: NOW.toISOString(),
          outside: false,
          addedByProfileId: ownerId,
        },
        0,
      );
      return recordItem(changeEnv(), { draft, identity: identityOf(stamp), op: 'create', actor });
    },
    seedFile: async (root, relPath, text): Promise<DriveItem> => {
      const staged = await stageBytes(changeEnv(), root, Readable.from([Buffer.from(text)]));
      return (await commitContent(changeEnv(), { root, staged, relPath, actor })).item;
    },
  };
}

export const DISK_FREE = 10 ** 12;

function posixOf(opened: TestStore, changeEnv: () => ConflictEnv): DrivePosix {
  const { store } = opened;
  const space = (): Promise<{ totalBytes: number; freeBytes: number }> =>
    Promise.resolve({ totalBytes: 2 * DISK_FREE, freeBytes: DISK_FREE });
  const env: PosixEnv = {
    change: { ...changeEnv(), store },
    guard: { status: hostQuotaSource(store), space },
    space: {
      read: new DriveReadService(store),
      quota: hostQuotaSource(store),
      probe: { space },
      inodes: () => Promise.resolve({ files: 1000, free: 900 }),
    },
    holds: () => false,
    lanes: new DriveRootLanes(),
  };
  return new DrivePosix(env);
}

function readableOf(opened: TestStore, posix: DrivePosix): FsRig['readable'] {
  const { store } = opened;
  return async (reader, root, target) => {
    const base = target.baseId === undefined ? undefined : store.driveInodes.ofItem(target.baseId);
    const rootInode = base ?? store.driveInodes.rootOf(root.id);
    const scope = new PosixScope(reader, randomUUID(), {
      drive: root,
      baseId: target.baseId ?? null,
      rootInode: rootInode.id,
    });
    const inode = store.driveInodes.ofItem(target.itemId);
    if (inode === undefined) throw new Error('the item has no inode');
    return posix.openTarget(scope, inode.id, false);
  };
}

export async function openFsRig(): Promise<FsRig> {
  const opened = await testStore(() => NOW);
  const { store } = opened;
  const ownerId = store.profiles.first().id;
  const memberId = store.profiles.create({ name: 'Sam' }).id;
  for (const drive of await ensureDrives(store, opened.layout, store.profiles.list())) {
    store.driveRoots.update(drive.id, { versions: true });
  }
  const changeEnv = envOf(opened);
  const read = new DriveReadService(store);
  const service = serviceOf(opened, read);
  const ownerNode = pairComputer(store, ownerId);
  const memberNode = pairComputer(store, memberId);
  const mount = mountingOf(store);
  const posix = posixOf(opened, changeEnv);
  const rig: FsRig = {
    opened,
    ownerId,
    memberId,
    ownerNode,
    memberNode,
    shared: sharedDrive(store),
    mine: personalDrive(store, ownerId),
    theirs: personalDrive(store, memberId),
    service,
    posix,
    changeEnv,
    readable: readableOf(opened, posix),
    mount,
    ...seedingOf(opened, ownerId, changeEnv),
  };
  mount(ownerNode, ownerId, rig.shared);
  mount(ownerNode, ownerId, rig.mine);
  mount(memberNode, memberId, rig.shared);
  mount(memberNode, memberId, rig.theirs);
  return rig;
}
