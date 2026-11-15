import { lstat, readFile, readlink, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestMetaInput } from '@smarteverything/domain/drive-mount';
import { Readable } from 'node:stream';
import type { DriveItem } from '@smarteverything/domain';
import { commitContent } from '../../../src/drive/changes';
import { DriveReadService } from '../../../src/drive/service-read';
import { PosixError } from '../../../src/drive/posix/errors';
import { PosixScope, type PosixEnv } from '../../../src/drive/posix/env';
import { DrivePosix } from '../../../src/drive/posix/service';
import { ensureDrives, personalDrive, sharedDrive } from '../../../src/drive/spaces';
import { fileEnv, stageBytes } from '../../../src/drive/versions';
import type { StoredDrive } from '../../../src/store/repositories/drive-roots';
import { testLogger } from '../../support/logs';
import type { TestStore } from '../../support/store';
import { newId, pairComputer } from '../placement-fixture';
import { driveTestStore } from '../spaces-fixture';
import { DrivePlacements } from '../../../src/drive/placements';

export const NOW = new Date('2026-11-07T00:00:00.000Z');

export const DISK_FREE = 10 ** 12;

export interface PosixRig {
  readonly opened: TestStore;
  readonly ownerId: string;
  readonly memberId: string;
  readonly mine: StoredDrive;
  readonly theirs: StoredDrive;
  readonly shared: StoredDrive;
  readonly posix: DrivePosix;
  readonly env: PosixEnv;
  readonly held: Set<number>;
  readonly limits: { freeBytes: number };
  readonly clock: { current: Date };
  readonly scope: PosixScope;
  readonly memberScope: PosixScope;
  readonly sharedScope: PosixScope;
  readonly attach: (
    nodeId: string,
    profileId: string,
    root: StoredDrive,
    base?: string,
  ) => Promise<PosixScope>;
  readonly node: string;
  readonly memberNode: string;
  readonly granted: (role: 'view' | 'edit') => Promise<PosixScope>;
  readonly rootIno: number;
  readonly close: () => Promise<void>;
}

const OP_KEY: Uint8Array<ArrayBuffer> = new Uint8Array(16);

export function key(): Uint8Array<ArrayBuffer> {
  return OP_KEY;
}

interface Controls {
  readonly held: Set<number>;
  readonly limits: { freeBytes: number };
  readonly clock: { current: Date };
}

function envOf(store: TestStore['store'], controls: Controls): PosixEnv {
  const { held, limits, clock } = controls;
  const space = (): Promise<{ totalBytes: number; freeBytes: number }> =>
    Promise.resolve({ totalBytes: 2 * DISK_FREE, freeBytes: limits.freeBytes });
  return {
    change: {
      ...fileEnv(store, testLogger('drive'), () => clock.current),
      store,
      purge: { rearm: (): void => undefined },
    },
    guard: { status: (profileId) => store.driveQuotas.status(profileId), space },
    space: {
      read: new DriveReadService(store),
      store,
      quota: (profileId) => store.driveQuotas.status(profileId),
      probe: { space },
      inodes: () => Promise.resolve({ files: 1000, free: 900 }),
    },
    holds: (inodeId) => held.has(inodeId),
  };
}

function attacherOf(store: TestStore['store'], posix: DrivePosix): PosixRig['attach'] {
  const placements = new DrivePlacements({ store, context: store.context, newId });
  let mounts = 0;
  return async (nodeId, profileId, root, base) => {
    mounts += 1;
    const placement = placements.set(
      { profileId },
      {
        deviceId: nodeId,
        rootId: root.id,
        folderItemId: base ?? null,
        mode: 'mounted',
        localPath: null,
        mountName: `drive-${String(mounts)}`,
        enabled: true,
      },
    );
    return (await posix.attach({ profileId, nodeId }, placement.id)).scope;
  };
}

function granterOf(
  rig: Pick<
    PosixRig,
    'posix' | 'scope' | 'opened' | 'mine' | 'memberId' | 'ownerId' | 'memberNode'
  >,
): PosixRig['granted'] {
  const { posix, scope, opened, mine } = rig;
  return async (role) => {
    const docs = await posix.mkdir(scope, mkdir('docs', scope.rootInode));
    await posix.mkdir(scope, mkdir('inner', docs.ino));
    await posix.create(scope, create('note.txt', docs.ino));
    await posix.create(scope, create('private.txt', scope.rootInode));
    const item = opened.store.driveItems.byPath(mine.id, 'docs', null);
    if (item === undefined) throw new Error('docs is missing');
    opened.store.driveGrants.set(
      { itemId: item.id, profileId: rig.memberId, role, expiresAt: null },
      rig.ownerId,
    );
    return new PosixScope({ profileId: rig.memberId, nodeId: rig.memberNode }, newId(), {
      drive: mine,
      baseId: item.id,
      rootInode: docs.ino,
    });
  };
}

export async function openPosixRig(history: boolean): Promise<PosixRig> {
  const opened = await driveTestStore(() => NOW);
  const { store } = opened;
  const ownerId = store.profiles.first().id;
  const memberId = store.profiles.create({ name: 'Sam' }).id;
  for (const drive of await ensureDrives(store, opened.layout, store.profiles.list())) {
    store.driveRoots.update(drive.id, { versions: history });
  }
  const controls: Controls = {
    held: new Set<number>(),
    limits: { freeBytes: DISK_FREE },
    clock: { current: NOW },
  };
  const env = envOf(store, controls);
  const posix = new DrivePosix(env);
  const attach = attacherOf(store, posix);
  const [mine, theirs] = [personalDrive(store, ownerId), personalDrive(store, memberId)];
  const [node, memberNode] = [pairComputer(store, ownerId), pairComputer(store, memberId)];
  const scope = await attach(node, ownerId, mine);
  const base = {
    opened,
    ownerId,
    memberId,
    mine,
    theirs,
    shared: sharedDrive(store),
    posix,
    env,
    ...controls,
  };
  const placed = { ...base, scope, attach, node, memberNode, rootIno: scope.rootInode };
  return {
    ...placed,
    granted: granterOf(placed),
    memberScope: await attach(memberNode, memberId, theirs),
    sharedScope: await attach(memberNode, memberId, base.shared),
    close: () => opened.close(),
  };
}

export async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof PosixError) return cause.code;
    throw cause;
  }
  return 'no error';
}

export function create(
  name: string,
  parent: number,
  options: { mode?: number; exclusive?: boolean } = {},
): RequestMetaInput<'CREATE'> {
  return {
    parent,
    name,
    mode: options.mode ?? 0o644,
    uid: null,
    gid: null,
    exclusive: options.exclusive ?? false,
    opKey: key(),
  };
}

export function mkdir(name: string, parent: number, mode = 0o755): RequestMetaInput<'MKDIR'> {
  return { parent, name, mode, uid: null, gid: null, opKey: key() };
}

export function removal(name: string, parent: number): RequestMetaInput<'UNLINK'> {
  return { parent, name, opKey: key() };
}

export function moving(
  from: [number, string],
  to: [number, string],
  flags = 0,
): RequestMetaInput<'RENAME'> {
  return {
    parent: from[0],
    name: from[1],
    newParent: to[0],
    newName: to[1],
    flags,
    opKey: key(),
  };
}

export async function diskText(drive: StoredDrive, relPath: string): Promise<string> {
  return readFile(join(drive.path, relPath), 'utf8');
}

export async function diskNames(drive: StoredDrive, relPath = ''): Promise<string[]> {
  return (await readdir(join(drive.path, relPath))).filter((name) => !name.startsWith('.'));
}

export async function diskMode(drive: StoredDrive, relPath: string): Promise<number> {
  return (await lstat(join(drive.path, relPath))).mode & 0o7777;
}

export async function diskLink(drive: StoredDrive, relPath: string): Promise<string> {
  return readlink(join(drive.path, relPath));
}

export async function diskIno(drive: StoredDrive, relPath: string): Promise<bigint> {
  return (await stat(join(drive.path, relPath), { bigint: true })).ino;
}

export async function putOnDisk(drive: StoredDrive, relPath: string, text: string): Promise<void> {
  await writeFile(join(drive.path, relPath), text);
}

export function symlinkRequest(
  name: string,
  parent: number,
  target: string,
): RequestMetaInput<'SYMLINK'> {
  return { parent, name, target, uid: null, gid: null, opKey: key() };
}

export function mknodRequest(
  name: string,
  parent: number,
  type: 4 | 5 | 6 | 7,
  rdev = 0,
): RequestMetaInput<'MKNOD'> {
  return { parent, name, type, rdev, mode: 0o644, uid: null, gid: null, opKey: key() };
}

export function linkRequest(ino: number, parent: number, name: string): RequestMetaInput<'LINK'> {
  return { ino, parent, name, opKey: key() };
}

export async function save(
  rig: PosixRig,
  drive: StoredDrive,
  relPath: string,
  text: string,
): Promise<DriveItem> {
  const root = rig.opened.store.driveRoots.byId(drive.id);
  const staged = await stageBytes(rig.env.change, root, Readable.from([Buffer.from(text)]));
  const written = await commitContent(rig.env.change, {
    root,
    staged,
    relPath,
    actor: { actorProfileId: rig.ownerId, via: 'app', deviceId: null },
  });
  return written.item;
}
