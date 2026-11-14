import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScanCommitter, type CommitDependencies } from '../../src/drive/scanner-commit';
import type { WalkEntry } from '../../src/drive/scanner-walk';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { driveRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000021';
const UPLOADED_AT = '2026-11-06T12:00:00.000Z';
const STALE_AT = '2026-11-06T12:00:01.000Z';
const DISK_AT = '2026-11-06T12:00:02.000Z';
const DISK_MS = Date.parse(DISK_AT);
const OPENED_AT = '2026-11-06T13:00:00.000Z';
const SHA256 = 'a'.repeat(64);

let fixture: DriveFixture;
let database: DriveFixture['database'];
let context: DriveFixture['context'];
let roots: DriveFixture['roots'];
let items: DriveFixture['items'];
let profileId = '';

beforeEach(() => {
  fixture = openDriveFixture();
  ({ database, context, roots, items } = fixture);
  fixture.addDrive(driveRoot(ROOT), '/library');
  profileId = new ProfilesRepository(context).create({ name: 'Robin' }).id;
});

afterEach(() => {
  fixture.database.close();
});

function dependencies(): CommitDependencies {
  return {
    items,
    write: (work) => context.write(work),
    now: () => new Date(NOW),
    newId: randomUUID,
  };
}

function committer(): ScanCommitter {
  return new ScanCommitter(dependencies(), roots.byId(ROOT));
}

function fileEntry(
  relPath: string,
  fields: Partial<Extract<WalkEntry, { kind: 'file' }>> = {},
): WalkEntry {
  return {
    kind: 'file',
    relPath,
    name: basename(relPath),
    parentRelPath: null,
    bytes: 5,
    modifiedMs: DISK_MS,
    dev: '7',
    ino: '8',
    ...fields,
  };
}

function folderEntry(
  relPath: string,
  fields: Partial<Extract<WalkEntry, { kind: 'folder' }>> = {},
): WalkEntry {
  return {
    kind: 'folder',
    relPath,
    name: basename(relPath),
    parentRelPath: null,
    bytes: 5,
    modifiedMs: DISK_MS,
    dev: '7',
    ino: '6',
    childCount: 1,
    ...fields,
  };
}

function scanned(entries: readonly WalkEntry[]): ScanCommitter {
  const scan = committer();
  scan.apply(entries);
  scan.finish([]);
  return scan;
}

function rowsAt(relPath: string): unknown[] {
  return database
    .prepare('select id from drive_items where root_id = ? and rel_path = ?')
    .all(ROOT, relPath);
}

function paths(): string[] {
  return database
    .prepare('select rel_path from drive_items where root_id = ? order by rel_path')
    .all(ROOT)
    .map((row) => String(row['rel_path']));
}

function rowAt(relPath: string): DriveItem {
  const row = items.byPath(ROOT, relPath, null);
  if (row === undefined) throw new Error(`The row for ${relPath} is missing.`);
  return row;
}

function uploadRow(
  relPath = 'uploaded.txt',
  identity: { readonly dev: string; readonly ino: string } = { dev: '3', ino: '4' },
): string {
  return items.write({
    item: {
      id: randomUUID(),
      rootId: ROOT,
      parentId: null,
      relPath,
      name: basename(relPath),
      kind: 'document',
      mime: 'text/plain',
      bytes: 5,
      sha256: SHA256,
      integrity: 'ok',
      thumb: { state: 'none' },
      modifiedAt: STALE_AT,
      addedAt: UPLOADED_AT,
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: profileId,
      remoteId: 'remote-42',
      remoteRev: 'rev-7',
    },
    identity,
  }).item.id;
}

function folderRow(relPath: string): string {
  return items.write({
    item: {
      id: randomUUID(),
      rootId: ROOT,
      parentId: null,
      relPath,
      name: basename(relPath),
      kind: 'folder',
      childCount: 7,
      bytes: 700,
      modifiedAt: STALE_AT,
      addedAt: UPLOADED_AT,
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
    },
    identity: { dev: '3', ino: '6' },
  }).item.id;
}

describe('committing a scan over a changing index', () => {
  it('adopts a row created after the committer loaded instead of inserting a second one', () => {
    scanned([fileEntry('existing.txt', { ino: '1' })]);
    const racing = committer();
    const uploaded = uploadRow();
    racing.apply([
      fileEntry('existing.txt', { ino: '1' }),
      fileEntry('uploaded.txt', { ino: '4' }),
    ]);
    const totals = racing.finish([]);
    expect(rowsAt('uploaded.txt')).toEqual([{ id: uploaded }]);
    expect(items.byPath(ROOT, 'uploaded.txt', null)).toMatchObject({
      id: uploaded,
      kind: 'document',
      mime: 'text/plain',
      bytes: 5,
      modifiedAt: DISK_AT,
      addedAt: UPLOADED_AT,
      addedByProfileId: profileId,
      remoteId: 'remote-42',
      remoteRev: 'rev-7',
      rev: 2,
      outside: true,
    });
    expect(totals).toEqual({ items: 2, folders: 0, bytes: 10 });
  });

  it('adopts a post-load folder row and its children under the adopted id', () => {
    const racing = committer();
    const uploaded = folderRow('incoming');
    racing.apply([
      folderEntry('incoming'),
      fileEntry('incoming/a.txt', { parentRelPath: 'incoming' }),
    ]);
    const totals = racing.finish([]);
    expect(rowsAt('incoming')).toEqual([{ id: uploaded }]);
    expect(items.byPath(ROOT, 'incoming', null)).toMatchObject({
      id: uploaded,
      kind: 'folder',
      childCount: 1,
      bytes: 5,
    });
    expect(items.byPath(ROOT, 'incoming/a.txt', null)).toMatchObject({
      parentId: uploaded,
      bytes: 5,
    });
    expect(paths()).toEqual(['incoming', 'incoming/a.txt']);
    expect(totals).toEqual({ items: 1, folders: 1, bytes: 5 });
  });

  it('adopts the row now holding a path when the loaded row moved away', () => {
    scanned([fileEntry('a.txt', { ino: '1' })]);
    const keeper = rowAt('a.txt');
    const racing = committer();
    items.write({
      item: { ...keeper, relPath: 'moved.txt', name: 'moved.txt' },
      identity: { dev: '7', ino: '1' },
    });
    const arriving = uploadRow('a.txt');
    racing.apply([fileEntry('a.txt', { ino: '5' })]);
    racing.finish([]);
    expect(rowsAt('a.txt')).toEqual([{ id: arriving }]);
    expect(paths()).toEqual(['a.txt', 'moved.txt']);
    expect(items.byPath(ROOT, 'a.txt', null)?.id).toBe(arriving);
    expect(items.byPath(ROOT, 'moved.txt', null)?.id).toBe(keeper.id);
  });

  it('prefers the row at the path over a repathed row with the same identity', () => {
    scanned([fileEntry('a.txt', { ino: '1' })]);
    const loaded = rowAt('a.txt');
    const racing = committer();
    items.write({
      item: { ...loaded, relPath: 'b.txt', name: 'b.txt' },
      identity: { dev: '7', ino: '1' },
    });
    const occupant = uploadRow('a.txt');
    racing.apply([fileEntry('a.txt', { ino: '1', bytes: 9 })]);
    racing.finish([]);
    expect(rowsAt('a.txt')).toEqual([{ id: occupant }]);
    expect(items.byPath(ROOT, 'a.txt', null)).toMatchObject({ bytes: 9 });
    expect(items.byPath(ROOT, 'b.txt', null)?.id).toBe(loaded.id);
    expect(paths()).toEqual(['a.txt', 'b.txt']);
  });

  it('adopts the row at the path when the loaded row was deleted', () => {
    scanned([fileEntry('a.txt', { ino: '1' })]);
    const loaded = rowAt('a.txt');
    const racing = committer();
    items.remove(loaded.id);
    const occupant = uploadRow('a.txt');
    racing.apply([fileEntry('a.txt', { ino: '1', bytes: 9 })]);
    racing.finish([]);
    expect(rowsAt('a.txt')).toEqual([{ id: occupant }]);
    expect(items.byPath(ROOT, 'a.txt', null)).toMatchObject({ id: occupant, bytes: 9 });
  });

  it('leaves an unchanged path alone on a later scan', () => {
    scanned([fileEntry('keep.txt')]);
    const before = items.byPath(ROOT, 'keep.txt', null);
    const again = committer();
    expect(again.previous).toBe(1);
    again.apply([fileEntry('keep.txt')]);
    expect(items.byPath(ROOT, 'keep.txt', null)).toEqual(before);
    expect(again.finish([])).toEqual({ items: 1, folders: 0, bytes: 5 });
  });

  it('evicts a post-load row occupying the destination of a move', () => {
    scanned([fileEntry('old.txt')]);
    const mover = rowAt('old.txt');
    const racing = committer();
    const occupant = uploadRow('new.txt');
    expect(rowsAt('new.txt')).toEqual([{ id: occupant }]);
    racing.apply([fileEntry('new.txt')]);
    const totals = racing.finish([]);
    expect(rowsAt('new.txt')).toEqual([{ id: mover.id }]);
    expect(items.find(occupant, null)).toBeUndefined();
    expect(items.byPath(ROOT, 'new.txt', null)).toMatchObject({ id: mover.id, relPath: 'new.txt' });
    expect(paths()).toEqual(['new.txt']);
    expect(totals).toEqual({ items: 1, folders: 0, bytes: 5 });
  });

  it('moves a row whose identity matches a new path instead of duplicating it', () => {
    scanned([fileEntry('old.txt')]);
    const moved = rowAt('old.txt');
    const again = committer();
    expect(again.previous).toBe(1);
    again.apply([fileEntry('new.txt')]);
    expect(again.finish([])).toEqual({ items: 1, folders: 0, bytes: 5 });
    expect(paths()).toEqual(['new.txt']);
    expect(items.byPath(ROOT, 'new.txt', null)).toMatchObject({ id: moved.id, relPath: 'new.txt' });
  });

  it('keeps the owning fields when a rescan writes changed facts', () => {
    uploadRow('edited.txt', { dev: '7', ino: '8' });
    const seeded = rowAt('edited.txt');
    items.markOpened(seeded.id, OPENED_AT);
    const scan = committer();
    scan.apply([fileEntry('edited.txt')]);
    const totals = scan.finish([]);
    expect(items.byPath(ROOT, 'edited.txt', null)).toMatchObject({
      id: seeded.id,
      rev: 2,
      modifiedAt: DISK_AT,
      addedAt: UPLOADED_AT,
      openedAt: OPENED_AT,
      addedByProfileId: profileId,
      remoteId: 'remote-42',
      remoteRev: 'rev-7',
    });
    expect(totals).toEqual({ items: 1, folders: 0, bytes: 5 });
  });

  it('reports the same totals for an unchanged scan', () => {
    const folder = folderEntry('docs', { ino: '2' });
    const first = committer();
    first.apply([folder, fileEntry('docs/a.txt', { parentRelPath: 'docs' })]);
    const totals = first.finish([]);
    expect(totals).toEqual({ items: 1, folders: 1, bytes: 5 });
    const second = committer();
    expect(second.previous).toBe(2);
    second.apply([folder, fileEntry('docs/a.txt', { parentRelPath: 'docs' })]);
    expect(second.finish([])).toEqual(totals);
  });
});
