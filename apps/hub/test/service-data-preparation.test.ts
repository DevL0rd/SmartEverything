import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { hubLayout, writeMarker, type HubLayout } from '../src/data-layout';
import { lockDataDirectory } from '../src/data-lock';
import { fileDraft, identityOf, isoOf } from '../src/drive/changes';
import { ensureManagedRoots } from '../src/drive/managed-roots';
import { nodeFiles } from '../src/drive/versions';
import { assertPhotosFolderPrepared } from '../src/photos/folder-migration';
import { PHOTO_FOLDER_RECEIPTS } from '../src/photos/folder-receipts';
import { preparationLayout, prepareHubData } from '../src/service/data-preparation';
import { openStore, type Store } from '../src/store/store';
import { testLogger } from './support/logs';

const NOW = '2026-11-08T12:00:00.000Z';
const directories: string[] = [];
const log = testLogger();

function opened(layout: HubLayout): Store {
  return openStore({
    path: layout.system.database.file,
    log,
    now: () => new Date(NOW),
    systemTimeZone: 'UTC',
  });
}

async function fixture(): Promise<{
  readonly layout: HubLayout;
  readonly itemId: string;
  readonly rootPath: string;
  readonly original: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'hub-preparation-'));
  directories.push(directory);
  const layout = hubLayout(directory, {});
  await mkdir(dirname(layout.system.database.file), { recursive: true });
  const store = opened(layout);
  try {
    const person = store.profiles.create({ name: 'Alice' });
    const roots = await ensureManagedRoots(store, layout, store.profiles.list());
    const root = roots.find((candidate) => candidate.ownerProfileId === person.id);
    if (root?.path === undefined || root.path === null) throw new Error('fixture root missing');
    const original = join(root.path, 'Camera roll/Alice/2026/2026-11/a.jpg');
    await mkdir(dirname(original), { recursive: true });
    await writeFile(original, 'image');
    const stamp = await nodeFiles.stamp(original);
    if (stamp === null) throw new Error('fixture file missing');
    const item = store.driveItems.write({
      item: fileDraft(
        {
          rootId: root.id,
          parentId: null,
          relPath: 'Camera roll/Alice/2026/2026-11/a.jpg',
          addedByProfileId: person.id,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: NOW,
          outside: false,
        },
        { bytes: stamp.size, sha256: createHash('sha256').update('image').digest('hex') },
      ),
      identity: identityOf(stamp),
    }).item;
    store.context.sql.run(
      'queue the migration fixture',
      'insert into drive_photo_relocations(item_id, from_path) values ($id, $path)',
      { id: item.id, path: item.relPath },
    );
    return { layout, itemId: item.id, rootPath: root.path, original };
  } finally {
    store.close();
  }
}

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

it('prepares the explicit target root without consulting another Hub bootstrap', async () => {
  const { layout } = await fixture();
  expect((await preparationLayout(layout.root, {})).system.database.file).toBe(
    layout.system.database.file,
  );
  await expect(preparationLayout('relative', {})).rejects.toThrow(/absolute/);
});

it('finishes lossless offline preparation before the normal Drive readiness check', async () => {
  const target = await fixture();
  await prepareHubData(target.layout, log);
  await prepareHubData(target.layout, log);
  const store = opened(target.layout);
  try {
    expect(() => {
      assertPhotosFolderPrepared(store.context.sql);
    }).not.toThrow();
    expect(store.driveItems.byId(target.itemId).relPath).toBe('Photos/a.jpg');
    expect(await readFile(join(target.rootPath, 'Photos/a.jpg'), 'utf8')).toBe('image');
    expect(await nodeFiles.stamp(target.original)).toBeNull();
    expect(
      await nodeFiles.stamp(join(target.rootPath, PHOTO_FOLDER_RECEIPTS, `${target.itemId}.json`)),
    ).not.toBeNull();
  } finally {
    store.close();
  }
});

it('holds exclusive data ownership during blocked offline preparation without reporting service readiness', async () => {
  const target = await fixture();
  let unblock = (): void => undefined;
  let reached = (): void => undefined;
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let waiting = true;
  const preparing = prepareHubData(target.layout, log, {
    files: {
      ...nodeFiles,
      syncDirectory: async (path) => {
        if (waiting) {
          waiting = false;
          reached();
          await blocked;
        }
        await nodeFiles.syncDirectory(path);
      },
    },
  });
  try {
    await entered;
    await expect(lockDataDirectory(target.layout)).rejects.toThrow(/already using/);
    expect(await nodeFiles.stamp(target.layout.system.run.ready)).toBeNull();
    expect(await readFile(target.original, 'utf8')).toBe('image');
  } finally {
    unblock();
    await preparing;
  }
  const lock = await lockDataDirectory(target.layout);
  await lock.release();
});

it('releases its database and data lock after a failed preparation and resumes the durable journal', async () => {
  const target = await fixture();
  await expect(
    prepareHubData(target.layout, log, {
      files: {
        ...nodeFiles,
        syncDirectory: () => Promise.reject(new Error('fixture disk sync failure')),
      },
    }),
  ).rejects.toThrow('fixture disk sync failure');
  const lock = await lockDataDirectory(target.layout);
  await lock.release();
  expect(await readFile(target.original, 'utf8')).toBe('image');
  const before = opened(target.layout);
  try {
    expect(() => {
      assertPhotosFolderPrepared(before.context.sql);
    }).toThrow(/preparation is incomplete/);
  } finally {
    before.close();
  }
  await prepareHubData(target.layout, log);
  expect(await readFile(join(target.rootPath, 'Photos/a.jpg'), 'utf8')).toBe('image');
});

it('honors interruption without deleting migration rollback inputs and can resume', async () => {
  const target = await fixture();
  const abort = new AbortController();
  abort.abort(new Error('fixture preparation interruption'));
  await expect(prepareHubData(target.layout, log, { signal: abort.signal })).rejects.toThrow(
    'fixture preparation interruption',
  );
  expect(await readFile(target.original, 'utf8')).toBe('image');
  await prepareHubData(target.layout, log);
  expect(await readFile(join(target.rootPath, 'Photos/a.jpg'), 'utf8')).toBe('image');
});

it('rejects a mismatched active data-root identity before opening or changing its data', async () => {
  const target = await fixture();
  await writeMarker(target.layout, {
    version: 1,
    rootId: randomUUID(),
    createdAt: NOW,
    state: 'active',
  });
  const before = await readFile(target.layout.system.database.file);
  await expect(
    prepareHubData(target.layout, log, { location: { rootId: randomUUID(), state: 'active' } }),
  ).rejects.toThrow(/different disk/);
  expect(await readFile(target.layout.system.database.file)).toEqual(before);
  expect(await readFile(target.original, 'utf8')).toBe('image');
  expect(await nodeFiles.stamp(target.layout.lock)).toBeNull();
});
