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
import { DriveAlbumsService } from '../../src/drive/albums';
import { commitContent, folderDraft, identityOf, isoOf, recordItem } from '../../src/drive/changes';
import type { ConflictEnv } from '../../src/drive/conflicts';
import { DriveFsApi, type FsCaller } from '../../src/drive/fs-api';
import type { FsSpaceEnv } from '../../src/drive/fs-space';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveWriteService } from '../../src/drive/service-write';
import { DriveShares } from '../../src/drive/shares';
import { ensureDrives, personalDrive, sharedDrive } from '../../src/drive/spaces';
import { fileEnv, nodeFiles, stageBytes } from '../../src/drive/versions';
import type { DriveQuotaStatus } from '../../src/store/repositories/drive-quotas';
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
  readonly api: DriveFsApi;
  readonly changeEnv: () => ConflictEnv;
  readonly owner: () => FsCaller;
  readonly member: () => FsCaller;
  readonly mount: (nodeId: string, profileId: string, root: StoredDrive, base?: string) => void;
  readonly seedFolder: (root: StoredDrive, relPath: string) => Promise<DriveItem>;
  readonly seedFile: (root: StoredDrive, relPath: string, text: string) => Promise<DriveItem>;
}

function envOf(opened: TestStore): () => ConflictEnv {
  return (): ConflictEnv => ({
    ...fileEnv(opened.store, testLogger('drive'), () => NOW),
    store: opened.store,
    purge: { rearm: (): void => undefined },
    conflicts: {
      insert: (): void => undefined,
      find: () => undefined,
      resolve: (): never => {
        throw new Error('unused');
      },
    },
  });
}

function serviceOf(opened: TestStore, read: DriveReadService): DriveWriteService {
  const { store } = opened;
  return new DriveWriteService({
    env: envOf(opened)(),
    store,
    read,
    albums: new DriveAlbumsService({
      albums: store.driveAlbums,
      items: store.driveItems,
      roots: store.driveRoots,
      grants: store.driveGrants,
      runner: { rows: (): [] => [], count: (): number => 0 },
      newId: randomUUID,
      now: (): string => NOW.toISOString(),
      timeZone: 'UTC',
    }),
    shares: new DriveShares({
      store,
      origin: (): { url: string; public: boolean } => ({ url: 'http://hub.local', public: false }),
      now: (): Date => NOW,
    }),
    scrub: { start: (): DriveScrubState => ({ state: 'idle', lastFinishedAt: null, corrupt: 0 }) },
    backups: { report: (input): DriveBackupReport => store.driveBackups.record(input) },
    guard: {
      status: (profileId): DriveQuotaStatus => store.driveQuotas.status(profileId),
      space: (): Promise<Pick<DriveDataSpace, 'totalBytes' | 'freeBytes'>> =>
        Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    scan: (): void => undefined,
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
      localPath: `/mnt/drive-${String(mounts)}`,
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

export function spaceEnvOf(rig: FsRig): FsSpaceEnv {
  const { store } = rig.opened;
  return {
    read: new DriveReadService(store),
    store,
    quota: (profileId) => store.driveQuotas.status(profileId),
    probe: {
      space: (): Promise<{ totalBytes: number; freeBytes: number }> =>
        Promise.resolve({ totalBytes: 2 * DISK_FREE, freeBytes: DISK_FREE }),
    },
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
    api: new DriveFsApi({ env: changeEnv(), store, read, write: service, ops: store.driveSyncOps }),
    changeEnv,
    owner: (): FsCaller => ({ profileId: ownerId, nodeId: ownerNode }),
    member: (): FsCaller => ({ profileId: memberId, nodeId: memberNode }),
    mount,
    ...seedingOf(opened, ownerId, changeEnv),
  };
  mount(ownerNode, ownerId, rig.shared);
  mount(ownerNode, ownerId, rig.mine);
  mount(memberNode, memberId, rig.shared);
  mount(memberNode, memberId, rig.theirs);
  return rig;
}
