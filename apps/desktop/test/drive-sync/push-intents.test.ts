import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import { PushNotReadyError, fileViewOf, pushIntents } from '../../src/drive-sync/push-intents.js';

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
