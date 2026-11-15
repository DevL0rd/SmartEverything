import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import { CLIENT_MIGRATIONS } from '../../src/drive-sync/db/migrations.js';

const ROOT = '77777777-7777-4777-8777-777777777777';

let scratch = '';

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-migration-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function seedVersionTwo(path: string): void {
  const database = new DatabaseSync(path);
  for (const migration of CLIENT_MIGRATIONS.filter((candidate) => candidate.version <= 2)) {
    for (const statement of migration.statements) database.exec(statement);
  }
  database.exec('pragma user_version = 2');
  const insert = database.prepare(
    `insert into files (placement_id, rel_path, kind, bytes, mtime_ns, mode, hub_rev,
       local_hash_state, block_size, blocks, pinned)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  const blocks = new Uint8Array(32).fill(3);
  insert.run(ROOT, 'synced.sh', 'file', 4, 5, 0o755, 7, 'hashed', 131072, blocks);
  insert.run(ROOT, 'fresh.txt', 'file', 4, 6, 0o644, null, 'hashed', 131072, blocks);
  insert.run(ROOT, 'windows.txt', 'file', 4, 7, 0, 2, 'hashed', 131072, blocks);
  insert.run(ROOT, 'dir', 'folder', 0, 8, 0, 3, 'hashed', null, null);
  insert.run(ROOT, 'wide.txt', 'file', 4, 9, 0o17777, 4, 'hashed', 131072, blocks);
  database
    .prepare(
      "insert into pending_ops (op_id, kind, payload, state) values (?, 'push', ?, 'queued')",
    )
    .run('op-1', JSON.stringify({ relPath: 'synced.sh' }));
  database.close();
}

describe('the metadata migration', () => {
  it('keeps every record and marks the ones the hub knows as needing a metadata push', () => {
    const path = join(scratch, 'client.sqlite');
    seedVersionTwo(path);
    const database = openDriveSyncDatabase(path, new Logger('desktop.drive-sync'));
    const records = new Map(database.files.list(ROOT).map((record) => [record.relPath, record]));
    expect(records.size).toBe(5);
    expect(records.get('synced.sh')).toMatchObject({
      mode: 0o755,
      hubRev: 7,
      metaDirty: true,
      xattrs: [],
      linkTarget: null,
      linkKey: null,
      hubInode: null,
    });
    expect(records.get('fresh.txt')).toMatchObject({ hubRev: null, metaDirty: false });
    expect(records.get('windows.txt')?.mode).toBe(0o644);
    expect(records.get('dir')?.mode).toBe(0o755);
    expect(records.get('wide.txt')?.mode).toBe(0o7777);
    expect(Buffer.from(records.get('synced.sh')?.blocks ?? [])).toEqual(Buffer.alloc(32, 3));
    database.close();
  });

  it('keeps the pending operations and accepts the new kinds', () => {
    const path = join(scratch, 'client.sqlite');
    seedVersionTwo(path);
    const database = openDriveSyncDatabase(path, new Logger('desktop.drive-sync'));
    database.pendingOps.enqueue({ opId: 'op-2', kind: 'meta', payload: { relPath: 'a' } });
    database.pendingOps.enqueue({ opId: 'op-3', kind: 'link', payload: { relPath: 'b' } });
    expect(database.pendingOps.list().map((op) => [op.opId, op.kind, op.state])).toEqual([
      ['op-1', 'push', 'queued'],
      ['op-2', 'meta', 'queued'],
      ['op-3', 'link', 'queued'],
    ]);
    database.close();
  });

  it('stores links and refuses a link without a target', () => {
    const database = openDriveSyncDatabase(
      join(scratch, 'client.sqlite'),
      new Logger('desktop.drive-sync'),
    );
    const base = {
      placementId: ROOT,
      relPath: 'l',
      kind: 'link' as const,
      bytes: 0,
      mtimeNs: 1n,
      mode: 0o777,
      hubRev: null,
      localHashState: 'hashed' as const,
      blockSize: null,
      blocks: null,
      linkKey: null,
      hubInode: null,
      xattrs: [],
      metaDirty: true,
    };
    database.files.upsert({ ...base, linkTarget: 'x' });
    expect(database.files.get(ROOT, 'l')?.linkTarget).toBe('x');
    expect(() => {
      database.files.upsert({ ...base, relPath: 'm', linkTarget: null });
    }).toThrow();
    database.close();
  });

  it('finds the names that share a hub inode', () => {
    const database = openDriveSyncDatabase(
      join(scratch, 'client.sqlite'),
      new Logger('desktop.drive-sync'),
    );
    const base = {
      placementId: ROOT,
      kind: 'file' as const,
      bytes: 1,
      mtimeNs: 1n,
      mode: 0o644,
      hubRev: 1,
      localHashState: 'hashed' as const,
      blockSize: 131072,
      blocks: new Uint8Array(32),
      linkTarget: null,
      linkKey: null,
      xattrs: [],
      metaDirty: false,
    };
    database.files.upsert({ ...base, relPath: 'a', hubInode: 5 });
    database.files.upsert({ ...base, relPath: 'b', hubInode: 5 });
    database.files.upsert({ ...base, relPath: 'c', hubInode: 6 });
    expect(database.files.byHubInode(ROOT, 5).map((record) => record.relPath)).toEqual(['a', 'b']);
    database.close();
  });
});
