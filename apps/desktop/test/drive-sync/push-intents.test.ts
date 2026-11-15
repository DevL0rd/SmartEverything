import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  inputOf,
  openDriveSyncDatabase,
  type DriveSyncDatabase,
  type FileInput,
} from '../../src/drive-sync/db/index.js';
import { PushNotReadyError, fileViewOf, pushIntents } from '../../src/drive-sync/push-intents.js';
import { NO_META } from './pull-support.js';

const ROOT = '44444444-4444-4444-8444-444444444444';
const BLOCK = 128 * 1024;

let scratch = '';
let database: DriveSyncDatabase;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-intents-'));
  database = openDriveSyncDatabase(
    join(scratch, 'client.sqlite'),
    new Logger('desktop.drive-sync'),
  );
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

function hashedFile(relPath: string, fill: number, hubRev: number | null): void {
  database.files.upsert({
    ...NO_META,
    placementId: ROOT,
    relPath,
    kind: 'file',
    bytes: 10,
    mtimeNs: 1n,
    mode: 0o644,
    hubRev,
    localHashState: 'hashed',
    blockSize: BLOCK,
    blocks: new Uint8Array(32).fill(fill),
  });
}

function folder(relPath: string, hubRev: number | null): void {
  database.files.upsert({
    ...NO_META,
    placementId: ROOT,
    relPath,
    kind: 'folder',
    bytes: 0,
    mtimeNs: 1n,
    mode: 0o755,
    hubRev,
    localHashState: 'hashed',
    blockSize: null,
    blocks: null,
  });
}

function view(): ReturnType<typeof fileViewOf> {
  return fileViewOf(database.files.list(ROOT));
}

describe('pushIntents', () => {
  it('turns a rename of a file the hub never saw into a push of the new path', () => {
    hashedFile('fresh.txt', 1, null);
    const before = view();
    database.files.rename(ROOT, 'fresh.txt', 'renamed.txt');
    const intents = pushIntents(
      {
        renames: [{ from: 'fresh.txt', to: 'renamed.txt', kind: 'file' }],
        changed: [],
        deleted: [],
      },
      before,
      view(),
    );
    expect(intents.map((intent) => intent.kind)).toEqual(['push']);
  });

  it('sends a pure rename of a known file as a move with its base revision', () => {
    hashedFile('x.txt', 1, 4);
    const before = view();
    database.files.rename(ROOT, 'x.txt', 'y.txt');
    const intents = pushIntents(
      { renames: [{ from: 'x.txt', to: 'y.txt', kind: 'file' }], changed: [], deleted: [] },
      before,
      view(),
    );
    expect(intents).toEqual([{ kind: 'move', from: 'x.txt', to: 'y.txt', baseRev: 4 }]);
  });

  it('plans a push after a move when the content changed as well', () => {
    hashedFile('x.txt', 1, 4);
    const before = view();
    database.files.rename(ROOT, 'x.txt', 'y.txt');
    hashedFile('y.txt', 2, 4);
    const intents = pushIntents(
      { renames: [{ from: 'x.txt', to: 'y.txt', kind: 'file' }], changed: [], deleted: [] },
      before,
      view(),
    );
    expect(intents.map((intent) => intent.kind)).toEqual(['move', 'push']);
  });

  it('puts the files of a deleted folder before the folder', () => {
    folder('dir', 2);
    folder('dir/sub', 3);
    hashedFile('dir/sub/a.txt', 1, 5);
    hashedFile('dir/b.txt', 1, 6);
    const intents = pushIntents({ renames: [], changed: [], deleted: ['dir'] }, view(), view());
    expect(intents).toEqual([
      { kind: 'tombstone', relPath: 'dir/sub/a.txt', baseRev: 5 },
      { kind: 'tombstone', relPath: 'dir/b.txt', baseRev: 6 },
      { kind: 'tombstone', relPath: 'dir/sub', baseRev: 3 },
      { kind: 'tombstone', relPath: 'dir', baseRev: 2 },
    ]);
  });

  it('does not tombstone paths the hub never had', () => {
    hashedFile('local-only.txt', 1, null);
    expect(
      pushIntents({ renames: [], changed: [], deleted: ['local-only.txt'] }, view(), view()),
    ).toEqual([]);
  });

  it('ignores folders in the changed list and refuses a file that is not hashed yet', () => {
    folder('empty', null);
    database.files.upsert({
      ...NO_META,
      placementId: ROOT,
      relPath: 'raw.txt',
      kind: 'file',
      bytes: 3,
      mtimeNs: 1n,
      mode: 0o644,
      hubRev: null,
      localHashState: 'unhashed',
      blockSize: null,
      blocks: null,
    });
    expect(pushIntents({ renames: [], changed: ['empty'], deleted: [] }, view(), view())).toEqual(
      [],
    );
    expect(() =>
      pushIntents({ renames: [], changed: ['raw.txt'], deleted: [] }, view(), view()),
    ).toThrow(PushNotReadyError);
  });
});

function amend(relPath: string, changes: Partial<FileInput>): void {
  const record = database.files.get(ROOT, relPath);
  if (record === undefined) throw new Error(`${relPath} is not recorded`);
  database.files.upsert(inputOf(record, changes));
}

function symlinkRecord(relPath: string, target: string, hubRev: number | null): void {
  database.files.upsert({
    ...NO_META,
    placementId: ROOT,
    relPath,
    kind: 'link',
    bytes: 0,
    mtimeNs: 1n,
    mode: 0o777,
    hubRev,
    localHashState: 'hashed',
    blockSize: null,
    blocks: null,
    linkTarget: target,
    metaDirty: true,
  });
}

function changed(relPath: string, before: ReturnType<typeof view>): readonly string[] {
  return pushIntents({ renames: [], changed: [relPath], deleted: [] }, before, view()).map(
    (intent) => intent.kind,
  );
}

describe('metadata intents', () => {
  it('sends a metadata push when only the mode of a known file changed', () => {
    hashedFile('run.sh', 1, 4);
    const before = view();
    amend('run.sh', { mode: 0o755, metaDirty: true });
    expect(changed('run.sh', before)).toEqual(['meta']);
  });

  it('pushes the content when the blocks changed as well as the mode', () => {
    hashedFile('run.sh', 1, 4);
    const before = view();
    hashedFile('run.sh', 2, 4);
    expect(changed('run.sh', before)).toEqual(['push']);
  });

  it('pushes a file the hub never saw even when its metadata is dirty', () => {
    hashedFile('new.sh', 1, null);
    expect(changed('new.sh', view())).toEqual(['push']);
  });

  it('sends a metadata push for a known folder and nothing for a new folder', () => {
    folder('known', 3);
    folder('fresh', null);
    expect(changed('known', view())).toEqual(['meta']);
    expect(changed('fresh', view())).toEqual([]);
  });

  it('pushes a new symlink as a link', () => {
    symlinkRecord('l', 'a/b', null);
    expect(changed('l', view())).toEqual(['link']);
  });

  it('plans nothing when a known symlink kept its target', () => {
    symlinkRecord('l', 'a/b', 6);
    expect(changed('l', view())).toEqual([]);
  });

  it('removes a known symlink before it pushes the new target', () => {
    symlinkRecord('l', 'a/b', 6);
    const before = view();
    amend('l', { linkTarget: 'c/d' });
    const intents = pushIntents({ renames: [], changed: ['l'], deleted: [] }, before, view());
    expect(intents.map((intent) => intent.kind)).toEqual(['tombstone', 'link']);
    expect(intents[0]).toMatchObject({ relPath: 'l', baseRev: 6 });
  });

  it('removes a known file before it replaces it with a symlink and the other way round', () => {
    hashedFile('swap', 1, 4);
    const toLink = view();
    database.files.remove(ROOT, 'swap');
    symlinkRecord('swap', 'x', null);
    expect(changed('swap', toLink)).toEqual(['tombstone', 'link']);
    amend('swap', { hubRev: 8 });
    const toFile = view();
    database.files.remove(ROOT, 'swap');
    hashedFile('swap', 1, null);
    expect(changed('swap', toFile)).toEqual(['tombstone', 'push']);
  });

  it('sends a metadata push after a rename that left dirty metadata behind', () => {
    hashedFile('x.txt', 1, 4);
    const before = view();
    database.files.rename(ROOT, 'x.txt', 'y.txt');
    amend('y.txt', { mode: 0o600, metaDirty: true });
    const intents = pushIntents(
      { renames: [{ from: 'x.txt', to: 'y.txt', kind: 'file' }], changed: [], deleted: [] },
      before,
      view(),
    );
    expect(intents.map((intent) => intent.kind)).toEqual(['move', 'meta']);
  });
});
