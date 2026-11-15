import type { DriveItem } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  DriveInodesRepository,
  momentOfNs,
  nsOfMoment,
} from '../../src/store/repositories/drive-inodes';
import { DriveInodeError } from '../../src/store/repositories/drive-item-inodes';
import {
  DriveItemsRepository,
  type DriveItemDraft,
} from '../../src/store/repositories/drive-items';
import {
  DriveMountCommitsRepository,
  coversRanges,
  mergeRanges,
} from '../../src/store/repositories/drive-mount-commits';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveTrashRepository } from '../../src/store/repositories/drive-trash';
import {
  DriveXattrsRepository,
  XATTR_LIST_MAX_BYTES,
  XATTR_VALUE_MAX_BYTES,
  xattrNameRefusal,
} from '../../src/store/repositories/drive-xattrs';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-14T00:00:00.000Z';
const MODIFIED = '2026-10-01T12:34:56.789Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000002';

let database: DatabaseSync;
let context: StoreContext;
let items: DriveItemsRepository;
let inodes: DriveInodesRepository;
let xattrs: DriveXattrsRepository;
let commits: DriveMountCommitsRepository;
let trash: DriveTrashRepository;

function itemId(index: number): string {
  return `0e000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function base(
  index: number,
  name: string,
  parentId: string | null = null,
): Pick<
  DriveItemDraft,
  | 'id'
  | 'rootId'
  | 'parentId'
  | 'relPath'
  | 'name'
  | 'modifiedAt'
  | 'addedAt'
  | 'starred'
  | 'shared'
  | 'outside'
  | 'addedByProfileId'
  | 'remoteId'
  | 'remoteRev'
> {
  return {
    id: itemId(index),
    rootId: ROOT,
    parentId,
    relPath: name,
    name,
    modifiedAt: MODIFIED,
    addedAt: NOW,
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
}

function file(
  index: number,
  name: string,
  parentId: string | null = null,
  bytes = 10,
): DriveItemDraft {
  return {
    ...base(index, name, parentId),
    kind: 'document',
    mime: 'text/plain',
    bytes,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  };
}

function folder(index: number, name: string, parentId: string | null = null): DriveItemDraft {
  return { ...base(index, name, parentId), kind: 'folder', childCount: 0, bytes: 0 };
}

function link(index: number, target: string): DriveItemDraft {
  return { ...base(index, 'l'), kind: 'link', bytes: target.length, linkTarget: target };
}

function special(index: number, name: string): DriveItemDraft {
  return { ...base(index, name), kind: 'special', bytes: 0 };
}

function write(
  draft: DriveItemDraft,
  extra: Partial<Parameters<DriveItemsRepository['write']>[0]> = {},
): { item: DriveItem; changed: boolean } {
  return items.write({ item: draft, identity: { dev: '7', ino: draft.id }, ...extra });
}

function inodeIdOf(id: string): number {
  return z
    .object({ inode_id: z.number() })
    .parse(database.prepare('select inode_id from drive_items where id = ?').get(id)).inode_id;
}

function alignedRows(): number {
  const rows = z.array(z.object({ modified_at: z.string(), mtime_ns: z.string() })).parse(
    database
      .prepare(
        `select i.modified_at, cast(n.mtime_ns as text) as mtime_ns
            from drive_items i join drive_inodes n on n.id = i.inode_id`,
      )
      .all(),
  );
  for (const row of rows) {
    expect(row.modified_at).toBe(momentOfNs(BigInt(row.mtime_ns)));
  }
  return rows.length;
}

function count(text: string): number {
  return z.object({ count: z.number() }).parse(database.prepare(text).get()).count;
}

const BYTES = (text: string): Uint8Array => new TextEncoder().encode(text);

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  const owner = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  const roots = new DriveRootsRepository(context, drivePathOf);
  roots.insert(sharedDriveRoot(ROOT));
  roots.insert(personalDriveRoot(OTHER_ROOT, owner));
  items = new DriveItemsRepository(context);
  inodes = new DriveInodesRepository(context);
  xattrs = new DriveXattrsRepository(context);
  commits = new DriveMountCommitsRepository(context);
  trash = new DriveTrashRepository(context);
});

afterEach(() => {
  database.close();
});

describe('writing items creates and updates their inodes', () => {
  it('gives a new file the default mode and times from the item', () => {
    write(file(1, 'a.txt'));
    const inode = inodes.byId(inodeIdOf(itemId(1)));
    expect(inode).toMatchObject({ type: 'file', mode: 0o644, uid: null, gid: null, orphan: false });
    expect(inode.mtimeNs).toBe(nsOfMoment(MODIFIED));
    expect(inode.ctimeNs).toBe(nsOfMoment(MODIFIED));
    expect(inode.btimeNs).toBe(nsOfMoment(NOW));
  });

  it('gives a folder mode 0755 and a chosen mode wins', () => {
    write(folder(1, 'docs'));
    write(file(2, 'run.sh'), { inode: { mode: 0o755 } });
    expect(inodes.ofItem(itemId(1))?.mode).toBe(0o755);
    expect(inodes.ofItem(itemId(1))?.type).toBe('dir');
    expect(inodes.ofItem(itemId(2))?.mode).toBe(0o755);
  });

  it('shares one inode between two names of a hard link', () => {
    write(file(1, 'a.txt'));
    write(file(2, 'b.txt'), { shareInode: inodeIdOf(itemId(1)) });
    expect(inodeIdOf(itemId(2))).toBe(inodeIdOf(itemId(1)));
    expect(inodes.linkCount(inodeIdOf(itemId(1)))).toBe(2);
    expect(inodes.names(inodeIdOf(itemId(1)))).toEqual([itemId(1), itemId(2)]);
  });

  it('refuses to share an inode of another drive or to move a name onto another inode', () => {
    write(file(1, 'a.txt'));
    const other = inodes.create({ rootId: OTHER_ROOT, type: 'file' });
    expect(() => write(file(2, 'b.txt'), { shareInode: other.id })).toThrow(DriveInodeError);
    write(file(3, 'c.txt'));
    expect(() => write(file(3, 'c.txt'), { shareInode: inodeIdOf(itemId(1)) })).toThrow(
      DriveInodeError,
    );
  });

  it('stores a symlink target in the inode and reads it back as the item', () => {
    const written = write(link(1, 'target'));
    expect(written.item).toMatchObject({ kind: 'link', linkTarget: 'target', bytes: 6 });
    expect(inodes.ofItem(itemId(1))).toMatchObject({ type: 'symlink', linkTarget: 'target' });
    write(link(1, 'new'));
    expect(inodes.ofItem(itemId(1))?.linkTarget).toBe('new');
    expect(items.byId(itemId(1), null)).toMatchObject({ kind: 'link', linkTarget: 'new' });
  });

  it('records a special file with its kind and refuses one without', () => {
    const fifo = special(1, 'p');
    expect(() => write(fifo)).toThrow(DriveInodeError);
    write(fifo, { inode: { specialType: 'fifo' } });
    expect(inodes.ofItem(itemId(1))?.type).toBe('fifo');
    write(special(2, 'c'), {
      inode: { specialType: 'char', rdev: 259 },
    });
    expect(inodes.ofItem(itemId(2))).toMatchObject({ type: 'char', rdev: 259 });
    expect(items.byId(itemId(2), null).kind).toBe('special');
  });

  it('applies a mode change from the disk and bumps the revision', () => {
    const first = write(file(1, 'a.txt'));
    const second = write(file(1, 'a.txt'), { inode: { mode: 0o755 } });
    expect(second.changed).toBe(true);
    expect(second.item.rev).toBe(first.item.rev + 1);
    expect(inodes.ofItem(itemId(1))?.mode).toBe(0o755);
    expect(write(file(1, 'a.txt'), { inode: { mode: 0o755 } }).changed).toBe(false);
  });

  it('leaves the change time alone when only content columns change and moves it for an inode change', () => {
    write(file(1, 'a.txt'));
    const before = inodes.ofItem(itemId(1))?.ctimeNs;
    write(file(1, 'a.txt', null, 99));
    expect(inodes.ofItem(itemId(1))?.ctimeNs).toBe(before);
    write(file(1, 'a.txt'), { inode: { mode: 0o600, ctimeNs: 5n } });
    expect(inodes.ofItem(itemId(1))?.ctimeNs).toBe(5n);
  });

  it('keeps the modified time and the nanosecond time equal beyond the millisecond', () => {
    write(file(1, 'a.txt'), { inode: { mtimeNs: 1_760_000_000_123_456_789n } });
    expect(inodes.ofItem(itemId(1))?.mtimeNs).toBe(1_760_000_000_123_456_789n);
    expect(items.byId(itemId(1), null).modifiedAt).toBe(momentOfNs(1_760_000_000_123_456_789n));
    write(file(2, 'b.txt'));
    write(file(3, 'c.txt'), { shareInode: inodeIdOf(itemId(2)) });
    inodes.setTimes(inodeIdOf(itemId(2)), { mtimeNs: 1_700_000_000_999_999_999n });
    write({ ...file(2, 'b.txt'), modifiedAt: '2026-01-01T00:00:00.000Z' });
    expect(alignedRows()).toBe(3);
  });

  it('mirrors a changed modified time to every name of a hard linked inode', () => {
    write(file(1, 'a.txt'));
    write(file(2, 'b.txt'), { shareInode: inodeIdOf(itemId(1)) });
    inodes.setTimes(inodeIdOf(itemId(1)), { mtimeNs: nsOfMoment('2026-02-02T02:02:02.002Z') });
    expect(items.byId(itemId(1), null).modifiedAt).toBe('2026-02-02T02:02:02.002Z');
    expect(items.byId(itemId(2), null).modifiedAt).toBe('2026-02-02T02:02:02.002Z');
  });
});

describe('inode attributes and counts', () => {
  it('sets and clears the owner with null meaning the person', () => {
    write(file(1, 'a.txt'));
    const id = inodeIdOf(itemId(1));
    inodes.setAttributes(id, { uid: 1000, gid: 100, mode: 0o600 });
    expect(inodes.byId(id)).toMatchObject({ uid: 1000, gid: 100, mode: 0o600 });
    inodes.setAttributes(id, { uid: null });
    expect(inodes.byId(id)).toMatchObject({ uid: null, gid: 100, mode: 0o600 });
  });

  it('counts links of a folder as two plus its folders and of the drive root the same way', () => {
    write(folder(1, 'a'));
    write(folder(2, 'a/b', itemId(1)));
    write(file(3, 'a/f', itemId(1)));
    write(folder(4, 'c'));
    expect(inodes.linkCount(inodeIdOf(itemId(1)))).toBe(3);
    expect(inodes.linkCount(inodeIdOf(itemId(2)))).toBe(2);
    expect(inodes.linkCount(inodeIdOf(itemId(3)))).toBe(1);
    expect(inodes.linkCount(inodes.rootOf(ROOT).id)).toBe(4);
    expect(inodes.linkCount(inodes.rootOf(OTHER_ROOT).id)).toBe(2);
  });

  it('counts many inodes at once and an unknown one as zero', () => {
    write(file(1, 'a.txt'));
    write(file(2, 'b.txt'), { shareInode: inodeIdOf(itemId(1)) });
    const counts = inodes.linkCounts([inodeIdOf(itemId(1)), 999999]);
    expect(counts.get(inodeIdOf(itemId(1)))).toBe(2);
    expect(counts.has(999999)).toBe(false);
    expect(inodes.linkCount(999999)).toBe(0);
  });

  it('has exactly one root inode per drive and never removes it', () => {
    const root = inodes.rootOf(ROOT);
    expect(root).toMatchObject({ isRoot: true, type: 'dir', mode: 0o755 });
    inodes.remove(root.id);
    expect(inodes.find(root.id)).toBeDefined();
    inodes.setOrphan(root.id, true);
    expect(inodes.byId(root.id).orphan).toBe(false);
  });
});

describe('inode lifecycle', () => {
  it('releases an inode when its last name goes and keeps it while a name remains', () => {
    write(file(1, 'a.txt'));
    write(file(2, 'b.txt'), { shareInode: inodeIdOf(itemId(1)) });
    const id = inodeIdOf(itemId(1));
    items.remove(itemId(1));
    expect(inodes.find(id)).toBeDefined();
    items.remove(itemId(2));
    expect(inodes.find(id)).toBeUndefined();
  });

  it('releases the inodes of a whole removed subtree', () => {
    write(folder(1, 'a'));
    write(file(2, 'a/f', itemId(1)));
    const ids = [inodeIdOf(itemId(1)), inodeIdOf(itemId(2))];
    items.remove(itemId(1));
    expect(inodes.findMany(ids)).toEqual([]);
  });

  it('keeps an orphan inode and its extended attributes after the last name goes', () => {
    write(file(1, 'a.txt'));
    const id = inodeIdOf(itemId(1));
    xattrs.set(id, 'user.k', BYTES('v'), 'any');
    inodes.setOrphan(id, true);
    items.remove(itemId(1));
    expect(inodes.orphans(ROOT).map((inode) => inode.id)).toEqual([id]);
    expect(inodes.linkCount(id)).toBe(0);
    expect(xattrs.get(id, 'user.k')).toEqual(BYTES('v'));
    inodes.remove(id);
    expect(xattrs.names(id)).toEqual([]);
  });

  it('lists inodes that have no name and are not held', () => {
    const lone = inodes.create({ rootId: ROOT, type: 'file' });
    expect(inodes.unnamed(ROOT).map((inode) => inode.id)).toEqual([lone.id]);
    inodes.setOrphan(lone.id, true);
    expect(inodes.unnamed(ROOT)).toEqual([]);
  });

  it('never reuses an inode number', () => {
    const first = inodes.create({ rootId: ROOT, type: 'file' });
    inodes.remove(first.id);
    expect(inodes.create({ rootId: ROOT, type: 'file' }).id).toBeGreaterThan(first.id);
  });

  it('counts the inodes of a drive', () => {
    write(file(1, 'a.txt'));
    expect(inodes.inodeCount(ROOT)).toBe(2);
  });

  it('removes the inodes with the drive', () => {
    write(file(1, 'a.txt'));
    database.exec(`delete from drive_roots where id = '${ROOT}'`);
    expect(count(`select count(*) as count from drive_inodes where root_id = '${ROOT}'`)).toBe(0);
  });
});

describe('trash keeps inodes and extended attributes', () => {
  it('stashes the inodes of a subtree and brings them back with their modes and attributes', () => {
    write(folder(1, 'a'));
    write(file(2, 'a/f', itemId(1)), { inode: { mode: 0o755 } });
    const child = inodeIdOf(itemId(2));
    xattrs.set(child, 'user.tag', BYTES('red'), 'any');
    trash.insert({
      itemId: itemId(1),
      rootId: ROOT,
      name: 'a',
      originalRelPath: 'a',
      trashRelPath: '.trash/a',
      isFolder: true,
      bytes: 0,
      deletedAt: NOW,
      purgeAt: '2026-12-14T00:00:00.000Z',
      deletedBy: null,
      addedByProfileId: null,
    });
    trash.stash(itemId(1));
    items.remove(itemId(1));
    expect(inodes.find(child)).toBeUndefined();
    write(folder(1, 'a'));
    trash.reinstate(itemId(1), trash.stashed(itemId(1)), 'a');
    expect(inodeIdOf(itemId(2))).toBe(child);
    expect(inodes.byId(child).mode).toBe(0o755);
    expect(xattrs.get(child, 'user.tag')).toEqual(BYTES('red'));
    expect(database.prepare('pragma foreign_key_check').all()).toEqual([]);
  });

  it('keeps nanosecond times exact through the stash', () => {
    write(folder(1, 'a'));
    write(file(2, 'a/f', itemId(1)), { inode: { mtimeNs: 1_760_000_000_123_456_789n } });
    const child = inodeIdOf(itemId(2));
    trash.insert({
      itemId: itemId(1),
      rootId: ROOT,
      name: 'a',
      originalRelPath: 'a',
      trashRelPath: '.trash/a',
      isFolder: true,
      bytes: 0,
      deletedAt: NOW,
      purgeAt: '2026-12-14T00:00:00.000Z',
      deletedBy: null,
      addedByProfileId: null,
    });
    trash.stash(itemId(1));
    items.remove(itemId(1));
    write(folder(1, 'a'));
    trash.reinstate(itemId(1), trash.stashed(itemId(1)), 'a');
    expect(inodes.byId(child).mtimeNs).toBe(1_760_000_000_123_456_789n);
  });
});

describe('extended attributes', () => {
  it('stores, lists in name order, replaces and removes', () => {
    const inode = inodes.create({ rootId: ROOT, type: 'file' }).id;
    expect(xattrs.set(inode, 'user.b', BYTES('2'), 'any')).toEqual({ stored: true });
    expect(xattrs.set(inode, 'user.a', BYTES('1'), 'any')).toEqual({ stored: true });
    expect(xattrs.names(inode)).toEqual(['user.a', 'user.b']);
    expect(xattrs.set(inode, 'user.a', BYTES('3'), 'replace')).toEqual({ stored: true });
    expect(xattrs.get(inode, 'user.a')).toEqual(BYTES('3'));
    expect(xattrs.remove(inode, 'user.a')).toBe(true);
    expect(xattrs.remove(inode, 'user.a')).toBe(false);
    expect(xattrs.get(inode, 'user.a')).toBeUndefined();
  });

  it('honours the create and replace flags', () => {
    const inode = inodes.create({ rootId: ROOT, type: 'file' }).id;
    expect(xattrs.set(inode, 'user.a', BYTES('1'), 'replace')).toEqual({
      stored: false,
      refusal: 'missing',
    });
    xattrs.set(inode, 'user.a', BYTES('1'), 'create');
    expect(xattrs.set(inode, 'user.a', BYTES('2'), 'create')).toEqual({
      stored: false,
      refusal: 'exists',
    });
  });

  it('accepts the user, trusted and security namespaces and refuses the rest', () => {
    expect(xattrNameRefusal('user.x')).toBeNull();
    expect(xattrNameRefusal('trusted.x')).toBeNull();
    expect(xattrNameRefusal('security.selinux')).toBeNull();
    expect(xattrNameRefusal('system.posix_acl_access')).toBe('unsupported');
    expect(xattrNameRefusal('other.x')).toBe('unsupported');
    expect(xattrNameRefusal('user.')).toBe('name_invalid');
    expect(xattrNameRefusal('')).toBe('name_invalid');
  });

  it('limits a name to 255 bytes counted in bytes', () => {
    expect(xattrNameRefusal(`user.${'a'.repeat(250)}`)).toBeNull();
    expect(xattrNameRefusal(`user.${'a'.repeat(251)}`)).toBe('name_invalid');
    expect(xattrNameRefusal(`user.${'é'.repeat(126)}`)).toBe('name_invalid');
    expect(xattrNameRefusal(`user.${'é'.repeat(125)}`)).toBeNull();
  });

  it('limits a value to 65536 bytes and the name list to 65536 bytes', () => {
    const inode = inodes.create({ rootId: ROOT, type: 'file' }).id;
    expect(xattrs.set(inode, 'user.big', new Uint8Array(XATTR_VALUE_MAX_BYTES), 'any')).toEqual({
      stored: true,
    });
    expect(
      xattrs.set(inode, 'user.over', new Uint8Array(XATTR_VALUE_MAX_BYTES + 1), 'any'),
    ).toEqual({ stored: false, refusal: 'value_too_big' });
    const other = inodes.create({ rootId: ROOT, type: 'file' }).id;
    const length = 'user.'.length + 250;
    const each = length + 1;
    const fits = Math.floor(XATTR_LIST_MAX_BYTES / each);
    for (let index = 0; index < fits; index += 1) {
      const name = `user.${String(index).padStart(250, 'n')}`;
      expect(xattrs.set(other, name, BYTES('x'), 'any')).toEqual({ stored: true });
    }
    const refused = xattrs.set(other, `user.${'z'.repeat(250)}`, BYTES('x'), 'any');
    expect(refused).toEqual({ stored: false, refusal: 'list_too_big' });
    expect(xattrs.listBytes(other)).toBe(fits * each);
  });

  it('copies the attributes of one inode to another', () => {
    const from = inodes.create({ rootId: ROOT, type: 'file' }).id;
    const to = inodes.create({ rootId: ROOT, type: 'file' }).id;
    xattrs.set(from, 'user.a', BYTES('1'), 'any');
    xattrs.copy(from, to);
    expect(xattrs.get(to, 'user.a')).toEqual(BYTES('1'));
  });

  it('stores binary values with zero bytes unchanged', () => {
    const inode = inodes.create({ rootId: ROOT, type: 'file' }).id;
    const value = Uint8Array.of(0, 255, 0, 1);
    xattrs.set(inode, 'user.bin', value, 'any');
    expect(xattrs.get(inode, 'user.bin')).toEqual(value);
  });
});

describe('mount commits', () => {
  let placement: string;
  let node: string;
  let inode: number;

  beforeEach(() => {
    node = '0d000000-0000-4000-8000-0000000000d1';
    placement = '0f000000-0000-4000-8000-000000000001';
    database
      .prepare(
        `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
          values (?, 'local', 'computer:laptop', 'computer', 'Laptop', 'm', 'v', ?, ?)`,
      )
      .run(node, NOW, NOW);
    database
      .prepare(
        `insert into computer_nodes (device_id, machine_id, token_hash, hub_url, paired_at) values (?, 'machine', 'hash', 'http://h', ?)`,
      )
      .run(node, NOW);
    database
      .prepare(
        `insert into drive_placements (id, device_id, root_id, folder_item_id, mode, local_path, mount_name,
          enabled, hold, created_by, created_at, excluded, ignore_patterns, conflict_copies, state,
          read_only, cache_bytes, pinned_bytes, open_files, pending_uploads, need_bytes, errors,
          reported_at)
          values (?, ?, ?, null, 'mounted', null, 'Drive', 1, null,
            (select id from profiles limit 1), ?, null, null, null, 'mounted',
            0, 0, 0, 0, 0, 0, '[]', ?)`,
      )
      .run(placement, node, ROOT, NOW, NOW);
    write(file(1, 'a.txt'));
    inode = inodeIdOf(itemId(1));
  });

  const opKey = (byte: number): Uint8Array => new Uint8Array(16).fill(byte);

  it('opens a commit once per operation key', () => {
    const open = { placementId: placement, nodeId: node, inodeId: inode, baseRev: 1 };
    const first = commits.begin({ ...open, opKey: opKey(1) });
    const again = commits.begin({ ...open, opKey: opKey(1) });
    expect(again.id).toBe(first.id);
    expect(commits.begin({ ...open, opKey: opKey(2) }).id).not.toBe(first.id);
    expect(first).toMatchObject({ state: 'open', ranges: [], size: null, resultRev: null });
  });

  it('records received ranges merged, finishes and aborts', () => {
    const open = { placementId: placement, nodeId: node, inodeId: inode, baseRev: 1 };
    const commit = commits.begin({ ...open, opKey: opKey(1) });
    commits.received(commit.id, [0, 100]);
    commits.received(commit.id, [200, 300]);
    expect(commits.received(commit.id, [100, 200]).ranges).toEqual([[0, 300]]);
    const done = commits.finish(commit.id, 300, 2);
    expect(done).toMatchObject({ state: 'done', size: 300, resultRev: 2 });
    const second = commits.begin({ ...open, opKey: opKey(2) });
    expect(commits.abort(second.id).state).toBe('aborted');
  });

  it('counts commits in flight per inode and lists the open ones', () => {
    const open = { placementId: placement, nodeId: node, inodeId: inode, baseRev: 1 };
    const commit = commits.begin({ ...open, opKey: opKey(1) });
    expect(commits.inFlight(placement, inode)).toBe(1);
    expect(commits.open(placement).map((row) => row.id)).toEqual([commit.id]);
    commits.finish(commit.id, 0, 2);
    expect(commits.inFlight(placement, inode)).toBe(0);
  });

  it('forgets finished commits the journal dropped but never an open one', () => {
    const open = { placementId: placement, nodeId: node, inodeId: inode, baseRev: 1 };
    const done = commits.begin({ ...open, opKey: opKey(1) });
    commits.finish(done.id, 0, 2);
    const live = commits.begin({ ...open, opKey: opKey(2) });
    expect(commits.forget(placement, [done.id, live.id])).toBe(1);
    expect(commits.find(done.id)).toBeUndefined();
    expect(commits.find(live.id)).toBeDefined();
  });

  it('sweeps finished commits the hello no longer lists', () => {
    const open = { placementId: placement, nodeId: node, inodeId: inode, baseRev: 1 };
    const kept = commits.begin({ ...open, opKey: opKey(1) });
    commits.finish(kept.id, 0, 2);
    const dropped = commits.begin({ ...open, opKey: opKey(2) });
    commits.abort(dropped.id);
    expect(commits.sweep(placement, [kept.id])).toBe(1);
    expect(commits.find(kept.id)).toBeDefined();
    expect(commits.find(dropped.id)).toBeUndefined();
  });

  it('removes every commit when the computer is unpaired and when the inode goes', () => {
    const open = { placementId: placement, nodeId: node, inodeId: inode, baseRev: 1 };
    commits.begin({ ...open, opKey: opKey(1) });
    items.remove(itemId(1));
    expect(count('select count(*) as count from drive_mount_commits')).toBe(0);
    write(file(2, 'b.txt'));
    commits.begin({ ...open, inodeId: inodeIdOf(itemId(2)), opKey: opKey(3) });
    database.prepare('delete from computer_nodes where device_id = ?').run(node);
    expect(count('select count(*) as count from drive_mount_commits')).toBe(0);
  });

  it('merges ranges and knows when they cover a size', () => {
    expect(mergeRanges([[0, 5]], [5, 9])).toEqual([[0, 9]]);
    expect(mergeRanges([[0, 5]], [7, 9])).toEqual([
      [0, 5],
      [7, 9],
    ]);
    expect(mergeRanges([[10, 20]], [0, 30])).toEqual([[0, 30]]);
    expect(coversRanges([[0, 9]], 9)).toBe(true);
    expect(
      coversRanges(
        [
          [0, 5],
          [7, 9],
        ],
        9,
      ),
    ).toBe(false);
    expect(coversRanges([], 0)).toBe(true);
    expect(coversRanges([], 1)).toBe(false);
  });
});
