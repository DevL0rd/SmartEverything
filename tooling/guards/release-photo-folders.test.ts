import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PHOTO_FOLDER_RECEIPTS } from '../../apps/hub/src/photos/folder-receipts.ts';
import { clearPhotoFolderReceipts, restorePhotoFolders } from '../release-photo-folders.ts';

const ROOT = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
let scratch = '';
let root = '';
let backup = '';
let original = '';
let moved = '';
let receipt = '';
const driveOf = (): string => root;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'photo-release-'));
  root = join(scratch, 'drive');
  original = join(root, 'Camera Roll', 'owner', 'video.mp4');
  moved = join(root, 'Photos', 'video.mp4');
  backup = join(scratch, 'backup.db');
  receipt = join(root, PHOTO_FOLDER_RECEIPTS, `${ITEM}.json`);
  mkdirSync(dirname(original), { recursive: true });
  mkdirSync(dirname(moved), { recursive: true });
  mkdirSync(dirname(receipt), { recursive: true });
  writeFileSync(original, 'original video bytes');
  const stat = statSync(original, { bigint: true });
  writeFileSync(
    receipt,
    JSON.stringify({
      kind: 'file',
      rootId: ROOT,
      itemId: ITEM,
      fromPath: 'Camera Roll/owner/video.mp4',
      toPath: 'Photos/video.mp4',
      dev: String(stat.dev),
      ino: String(stat.ino),
      bytes: Number(stat.size),
      mtimeNs: String(stat.mtimeNs),
      sha256: null,
    }),
  );
  const database = new DatabaseSync(backup);
  database.exec(
    `create table drive_roots(id text, owner_profile_id text, scope text); create table drive_items(id text, root_id text, rel_path text)`,
  );
  database
    .prepare('insert into drive_roots(id, owner_profile_id, scope) values(?, ?, ?)')
    .run(ROOT, 'owner', 'person');
  database
    .prepare('insert into drive_items values(?, ?, ?)')
    .run(ITEM, ROOT, 'Camera Roll/owner/video.mp4');
  database.close();
  renameSync(original, moved);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('filesystem migration rollback', () => {
  it('restores the original video bytes and inode without copying or deleting recovery receipts', () => {
    const inode = statSync(moved).ino;
    rmSync(join(root, 'Camera Roll'), { recursive: true });
    restorePhotoFolders(backup, driveOf);
    expect(readFileSync(original, 'utf8')).toBe('original video bytes');
    expect(statSync(original).ino).toBe(inode);
    expect(existsSync(moved)).toBe(false);
    expect(existsSync(receipt)).toBe(true);
    restorePhotoFolders(backup, driveOf);
    clearPhotoFolderReceipts(backup, driveOf);
    expect(existsSync(receipt)).toBe(false);
  });

  it('preserves previously completed moves recorded in a same-schema backup', () => {
    const database = new DatabaseSync(backup);
    database.prepare('update drive_items set rel_path=? where id=?').run('Photos/video.mp4', ITEM);
    database.close();
    restorePhotoFolders(backup, driveOf);
    expect(readFileSync(moved, 'utf8')).toBe('original video bytes');
    expect(existsSync(original)).toBe(false);
    expect(existsSync(receipt)).toBe(true);
  });

  it('resumes a crash between no-clobber linking and removing the moved path', () => {
    linkSync(moved, original);
    restorePhotoFolders(backup, driveOf);
    expect(readFileSync(original, 'utf8')).toBe('original video bytes');
    expect(existsSync(moved)).toBe(false);
  });

  it('preserves both files and the receipt if the original path was reused', () => {
    writeFileSync(original, 'different file');
    expect(() => restorePhotoFolders(backup, driveOf)).toThrow('different file');
    expect(readFileSync(original, 'utf8')).toBe('different file');
    expect(readFileSync(moved, 'utf8')).toBe('original video bytes');
    expect(existsSync(receipt)).toBe(true);
  });

  it('refuses changed moved bytes instead of restoring an unverified file', () => {
    writeFileSync(moved, 'changed video');
    expect(() => restorePhotoFolders(backup, driveOf)).toThrow('cannot be verified');
    expect(existsSync(original)).toBe(false);
    expect(existsSync(receipt)).toBe(true);
  });
  it('recreates removed source folders and restores trash metadata from the saved database', () => {
    const folderId = '33333333-3333-4333-8333-333333333333';
    const trashId = '44444444-4444-4444-8444-444444444444';
    const database = new DatabaseSync(backup);
    database.prepare('insert into drive_items values(?, ?, ?)').run(folderId, ROOT, 'old-empty');
    database.exec(`create table drive_trash(item_id text, root_id text, name text,
      original_rel_path text, trash_rel_path text, is_folder integer, bytes integer,
      deleted_at text, purge_at text, deleted_by text, added_by_profile_id text)`);
    const at = '2026-11-08T00:00:00.000Z';
    const purgeAt = '2027-11-08T00:00:00.000Z';
    database
      .prepare('insert into drive_trash values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        trashId,
        ROOT,
        'deleted.jpg',
        'Camera Roll/owner/deleted.jpg',
        '.smarteverything/trash/deleted',
        0,
        7,
        at,
        purgeAt,
        null,
        null,
      );
    database.close();
    const directory = dirname(receipt);
    writeFileSync(
      join(directory, `${folderId}.json`),
      JSON.stringify({
        kind: 'folder',
        rootId: ROOT,
        itemId: folderId,
        fromPath: 'old-empty',
      }),
    );
    writeFileSync(
      join(directory, `${trashId}.json`),
      JSON.stringify({
        kind: 'trash',
        rootId: ROOT,
        itemId: trashId,
        fromPath: 'Camera Roll/owner/deleted.jpg',
        toPath: 'Photos/deleted.jpg',
      }),
    );
    const trash = join(root, '.smarteverything/trash/deleted');
    mkdirSync(dirname(trash), { recursive: true });
    writeFileSync(trash, 'deleted');
    writeFileSync(
      `${trash}.json`,
      JSON.stringify({
        itemId: trashId,
        rootId: ROOT,
        name: 'deleted.jpg',
        originalRelPath: 'Photos/deleted.jpg',
        trashRelPath: '.smarteverything/trash/deleted',
        isFolder: false,
        bytes: 7,
        deletedAt: at,
        purgeAt,
        deletedBy: null,
        addedByProfileId: null,
      }),
    );
    restorePhotoFolders(backup, driveOf);
    expect(statSync(join(root, 'old-empty')).isDirectory()).toBe(true);
    expect(JSON.parse(readFileSync(`${trash}.json`, 'utf8'))).toMatchObject({
      originalRelPath: 'Camera Roll/owner/deleted.jpg',
      bytes: 7,
    });
    expect(readFileSync(trash, 'utf8')).toBe('deleted');
    restorePhotoFolders(backup, driveOf);
  });
});
