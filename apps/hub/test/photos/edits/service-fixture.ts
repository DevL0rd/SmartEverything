import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { DriveItem } from '@smarteverything/domain';
import sharp from 'sharp';
import {
  commitContent,
  folderDraft,
  identityOf,
  isoOf,
  recordItem,
} from '../../../src/drive/changes';
import { ensureDrives, personalDrive } from '../../../src/drive/spaces';
import { DriveReadService } from '../../../src/drive/service-read';
import type { DriveCaller } from '../../../src/drive/service-write-support';
import { fileEnv, nodeFiles, stageBytes } from '../../../src/drive/versions';
import { ColourRunner } from '../../../src/photos/edits/colour-runner';
import type { EditDeps } from '../../../src/photos/edits/deps';
import type { Eraser } from '../../../src/photos/edits/eraser';
import { PreviewDecoders, SHARP_DECODER } from '../../../src/photos/pipeline/preview';
import type { StoredDrive } from '../../../src/store/repositories/drive-roots';
import { testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';

export const NOW = new Date('2026-11-14T10:00:00.000Z');

export interface Rig {
  readonly opened: TestStore;
  readonly ownerId: string;
  readonly memberId: string;
  readonly mine: StoredDrive;
  readonly deps: EditDeps;
  readonly owner: DriveCaller;
  readonly member: DriveCaller;
  readonly seed: (relPath: string, bytes: Buffer) => Promise<DriveItem>;
  readonly bytesOf: (relPath: string) => Promise<Buffer>;
  readonly guard: { freeBytes: number };
}

function envOf(opened: TestStore): EditDeps['env'] {
  return {
    ...fileEnv(opened.store, testLogger('drive'), () => NOW),
    store: opened.store,
    purge: { rearm: (): void => undefined },
  };
}

function depsOf(
  opened: TestStore,
  script: string,
  eraser: Eraser,
  guard: { freeBytes: number },
): EditDeps {
  const decoders = new PreviewDecoders();
  decoders.register(SHARP_DECODER);
  return {
    env: envOf(opened),
    store: opened.store,
    read: new DriveReadService(opened.store),
    guard: {
      status: (profileId) => opened.store.driveQuotas.status(profileId),
      space: () => Promise.resolve({ totalBytes: 10 ** 12, freeBytes: guard.freeBytes }),
    },
    layout: opened.layout,
    decoders,
    colour: new ColourRunner(script),
    eraser,
  };
}

async function seedFolder(
  deps: EditDeps,
  mine: StoredDrive,
  ownerId: string,
  relPath: string,
): Promise<void> {
  const path = join(mine.path, relPath);
  await mkdir(path, { recursive: true });
  const stamp = await nodeFiles.stamp(path);
  if (stamp === null) return;
  recordItem(deps.env, {
    draft: folderDraft(
      {
        rootId: mine.id,
        parentId: null,
        relPath,
        modifiedAt: isoOf(stamp.mtimeNs),
        addedAt: NOW.toISOString(),
        outside: false,
        addedByProfileId: ownerId,
      },
      0,
    ),
    identity: identityOf(stamp),
    op: 'create',
    actor: { actorProfileId: ownerId, via: 'app', deviceId: null },
  });
}

async function seedFile(
  deps: EditDeps,
  place: { readonly mine: StoredDrive; readonly ownerId: string },
  relPath: string,
  bytes: Buffer,
): Promise<DriveItem> {
  const staged = await stageBytes(deps.env, place.mine, Readable.from([bytes]));
  const written = await commitContent(deps.env, {
    root: place.mine,
    staged,
    relPath,
    actor: { actorProfileId: place.ownerId, via: 'app', deviceId: null },
  });
  return written.item;
}

export async function openRig(script: string, eraser: Eraser): Promise<Rig> {
  const opened = await testStore(() => NOW);
  const ownerId = opened.store.profiles.first().id;
  const memberId = opened.store.profiles.create({ name: 'Sam' }).id;
  for (const drive of await ensureDrives(
    opened.store,
    opened.layout,
    opened.store.profiles.list(),
  )) {
    opened.store.driveRoots.update(drive.id, { versions: true });
  }
  const mine = personalDrive(opened.store, ownerId);
  const guard = { freeBytes: 10 ** 12 };
  const deps = depsOf(opened, script, eraser, guard);
  await seedFolder(deps, mine, ownerId, 'Photos');
  return {
    opened,
    ownerId,
    memberId,
    mine,
    deps,
    owner: { profileId: ownerId, owner: true, via: 'app', deviceId: null },
    member: { profileId: memberId, owner: false, via: 'app', deviceId: null },
    guard,
    seed: (relPath, bytes): Promise<DriveItem> => seedFile(deps, { mine, ownerId }, relPath, bytes),
    bytesOf: (relPath) => readFile(join(mine.path, relPath)),
  };
}

export function sha(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function grey(
  width: number,
  height: number,
  level: number,
  format: 'jpeg' | 'png' = 'jpeg',
): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: level, g: level, b: level } },
  });
  return format === 'jpeg' ? image.jpeg({ quality: 100 }).toBuffer() : image.png().toBuffer();
}

export async function meanOf(bytes: Buffer): Promise<number> {
  const { channels } = await sharp(bytes).stats();
  return channels[0]?.mean ?? -1;
}
