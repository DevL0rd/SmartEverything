import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitContent, folderDraft, identityOf, isoOf, recordItem } from '../../src/drive/changes';
import type { ConflictEnv } from '../../src/drive/conflicts';
import { DriveFsApi, type FsCaller } from '../../src/drive/fs-api';
import { DrivePlacements } from '../../src/drive/placements';
import { DriveReadService } from '../../src/drive/service-read';
import { ensureDrives, personalDrive } from '../../src/drive/spaces';
import { fileEnv, nodeFiles, stageBytes } from '../../src/drive/versions';
import type { StoredDrive } from '../../src/store/repositories/drive-roots';
import { testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { newId, pairComputer } from './placement-fixture';
import { driveTestStore } from './spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');

let opened: TestStore;
let person = '';
let caller: FsCaller;
let api: DriveFsApi;

function env(): ConflictEnv {
  return {
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
  };
}

function actor(): { actorProfileId: string; via: 'app'; deviceId: null } {
  return { actorProfileId: person, via: 'app', deviceId: null };
}

async function save(drive: StoredDrive, relPath: string, text: string): Promise<DriveItem> {
  const staged = await stageBytes(env(), drive, Readable.from([Buffer.from(text)]));
  const written = await commitContent(env(), { root: drive, staged, relPath, actor: actor() });
  return written.item;
}

async function seedFolder(drive: StoredDrive, relPath: string): Promise<DriveItem> {
  const path = join(drive.path, relPath);
  await nodeFiles.mkdir(path);
  const stamp = await nodeFiles.stamp(path);
  if (stamp === null) throw new Error('missing');
  return recordItem(env(), {
    draft: folderDraft(
      {
        rootId: drive.id,
        parentId: null,
        relPath,
        modifiedAt: isoOf(stamp.mtimeNs),
        addedAt: NOW.toISOString(),
        outside: false,
        addedByProfileId: person,
      },
      0,
    ),
    identity: identityOf(stamp),
    op: 'create',
    actor: actor(),
  });
}

function drive(): StoredDrive {
  return personalDrive(opened.store, person);
}

async function saveThroughTemp(
  target: DriveItem,
  text: string,
  temp: string,
): Promise<{ readonly entry: Awaited<ReturnType<DriveFsApi['rename']>>; readonly tempId: string }> {
  const created = await save(drive(), temp, text);
  const entry = await api.rename(caller, drive().id, {
    opId: randomUUID(),
    itemId: created.id,
    parentId: null,
    name: target.name,
  });
  return { entry, tempId: created.id };
}

beforeEach(async () => {
  opened = await driveTestStore(() => NOW);
  person = opened.store.profiles.first().id;
  await ensureDrives(opened.store, opened.layout, opened.store.profiles.list());
  const node = pairComputer(opened.store, person);
  new DrivePlacements({ store: opened.store, context: opened.store.context, newId }).set(
    { profileId: person },
    {
      deviceId: node,
      rootId: drive().id,
      folderItemId: null,
      mode: 'mounted',
      localPath: '/home/robin/SmartEverything/My Drive',
      enabled: true,
    },
  );
  caller = { profileId: person, nodeId: node };
  api = new DriveFsApi({
    env: env(),
    store: opened.store,
    read: new DriveReadService(opened.store),
    write: { change: (): Promise<never> => Promise.reject(new Error('unused')) },
    ops: opened.store.driveSyncOps,
  });
});

afterEach(async () => {
  await opened.close();
});

describe.each([
  { history: true, kept: 1 },
  { history: false, kept: 0 },
])('saving over a file through the mount, history $history', ({ history, kept }) => {
  beforeEach(() => {
    opened.store.driveRoots.update(drive().id, { versions: history });
  });

  it('replaces the file when a temp file is renamed over it and keeps the old bytes only with history', async () => {
    const original = await save(drive(), 'doc.txt', 'first');
    const { entry, tempId } = await saveThroughTemp(original, 'second', 'doc.txt.tmp');
    expect(entry.id).toBe(original.id);
    expect(entry.size).toBe(6);
    expect(await readFile(join(drive().path, 'doc.txt'), 'utf8')).toBe('second');
    expect(await readdir(drive().path)).not.toContain('doc.txt.tmp');
    expect(opened.store.driveItems.find(tempId, null)).toBeUndefined();
    expect(opened.store.driveItems.byPath(drive().id, 'doc.txt.tmp', null)).toBeUndefined();
    const versions = opened.store.driveVersions.forItem(original.id, null, 10).versions;
    expect(versions).toHaveLength(kept);
    expect(opened.store.driveItems.byId(original.id, null).rev).toBeGreaterThan(original.rev);
  });

  it('replaces the file when it is saved in place', async () => {
    const original = await save(drive(), 'doc.txt', 'first');
    const saved = await save(drive(), 'doc.txt', 'second');
    expect(saved.id).toBe(original.id);
    expect(await readFile(join(drive().path, 'doc.txt'), 'utf8')).toBe('second');
    expect(opened.store.driveVersions.forItem(original.id, null, 10).versions).toHaveLength(kept);
  });
});

describe('a rename onto an existing name', () => {
  it('refuses a folder in either position', async () => {
    const file = await save(drive(), 'doc.txt', 'first');
    const folder = await seedFolder(drive(), 'docs');
    const other = await seedFolder(drive(), 'other');
    for (const [itemId, name] of [
      [file.id, folder.name],
      [other.id, file.name],
    ] as const) {
      const refusal = await api
        .rename(caller, drive().id, { opId: randomUUID(), itemId, parentId: null, name })
        .catch((cause: unknown) => cause);
      expect(refusal).toBeInstanceOf(ApiError);
      expect(refusal).toMatchObject({ code: 'conflict' });
    }
    expect(await readFile(join(drive().path, 'doc.txt'), 'utf8')).toBe('first');
  });
});
