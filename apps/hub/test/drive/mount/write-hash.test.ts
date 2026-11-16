import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Staging } from '../../../src/drive/mount/staging';
import { SettleGroup } from '../../../src/drive/mount/settle-group';
import { HashPool, HashWorkerError } from '../../../src/drive/mount/workers';
import { nodeFiles } from '../../../src/drive/versions';
import type { Store } from '../../../src/store/store';
import { testLogger } from '../../support/logs';
import { bundleWorker } from '../drive-fixture';
import { openPosixRig, type PosixRig } from '../posix/posix-rig';
import { attachTo, openMountRig, opKey, type Attached, type MountRig } from './mount-rig';

const WRITTEN_NS = 1_763_100_000_123_456_789n;

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

let scripts = '';
let script = '';

beforeAll(async () => {
  scripts = await mkdtemp(join(tmpdir(), 'mount-hash-test-'));
  script = join(scripts, 'mount-hash-worker.mjs');
  await bundleWorker('mount/hash-worker.ts', script);
});

afterAll(async () => {
  await rm(scripts, { recursive: true, force: true });
});

class CountingPool extends HashPool {
  calls = 0;

  override hash(path: string): Promise<string> {
    this.calls += 1;
    return super.hash(path);
  }
}

describe('the staging digest', () => {
  let posix: PosixRig;
  let pool: CountingPool;
  let staging: Staging;

  const stagingOver = (): Staging =>
    new Staging({ files: nodeFiles, store: posix.opened.store, hashes: () => pool });

  beforeEach(async () => {
    posix = await openPosixRig(false);
    pool = new CountingPool(script, 2);
    staging = stagingOver();
  });

  afterEach(async () => {
    await pool.stop();
    await posix.close();
  });

  const ROOT = (): string => posix.mine.id;
  const target = (): { rootId: string; commitId: number } => ({ rootId: ROOT(), commitId: 1 });

  it('hashes in-order frames while they stream and never asks the pool', async () => {
    await staging.ensure(ROOT(), 1);
    const parts = [Buffer.from('alpha '), Buffer.from('beta '), Buffer.from('gamma')];
    let offset = 0;
    for (const part of parts) {
      await staging.write(target(), offset, part);
      offset += part.length;
    }
    expect(await staging.digest(ROOT(), 1, offset)).toBe(sha(Buffer.concat(parts)));
    expect(pool.calls).toBe(0);
  });

  it('hashes out-of-order ranges in the worker pool and gets the same digest', async () => {
    await staging.ensure(ROOT(), 1);
    await staging.write(target(), 6, Buffer.from('world'));
    await staging.write(target(), 0, Buffer.from('hello '));
    expect(await staging.digest(ROOT(), 1, 11)).toBe(sha(Buffer.from('hello world')));
    expect(pool.calls).toBe(1);
  });

  it('uses the pool when the size differs from the streamed bytes', async () => {
    await staging.ensure(ROOT(), 1);
    await staging.write(target(), 0, Buffer.from('abcdef'));
    const path = await staging.path(ROOT(), 1);
    await writeFile(path, 'abc');
    expect(await staging.digest(ROOT(), 1, 3)).toBe(sha(Buffer.from('abc')));
    expect(pool.calls).toBe(1);
  });

  it('does not trust a stream that was overwritten or zeroed', async () => {
    await staging.ensure(ROOT(), 1);
    await staging.write(target(), 0, Buffer.from('abcdef'));
    await staging.write(target(), 2, Buffer.from('XY'));
    expect(await staging.digest(ROOT(), 1, 6)).toBe(sha(Buffer.from('abXYef')));
    await staging.zero(target(), { offset: 0, length: 2 });
    expect(await staging.digest(ROOT(), 1, 6)).toBe(
      sha(await readFile(await staging.path(ROOT(), 1))),
    );
    expect(pool.calls).toBe(2);
  });

  it('hashes a staged file left from before a restart through the pool', async () => {
    await staging.ensure(ROOT(), 1);
    await staging.write(target(), 0, Buffer.from('kept'));
    const restarted = stagingOver();
    await restarted.ensure(ROOT(), 1);
    await restarted.write(target(), 4, Buffer.from('more'));
    expect(await restarted.digest(ROOT(), 1, 8)).toBe(sha(Buffer.from('keptmore')));
    expect(pool.calls).toBe(1);
  });
});

describe('the hash worker pool', () => {
  it('hashes many files in parallel with the sized pool', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mount-pool-'));
    const pool = new HashPool(script, 3);
    try {
      const names = await Promise.all(
        Array.from({ length: 8 }, async (_, index) => {
          const path = join(dir, String(index));
          await writeFile(path, `content ${String(index)}`.repeat(1000));
          return path;
        }),
      );
      const digests = await Promise.all(names.map((path) => pool.hash(path)));
      for (const [index, path] of names.entries()) {
        expect(digests[index]).toBe(sha(await readFile(path)));
      }
    } finally {
      await pool.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a missing file by name and keeps working', async () => {
    const pool = new HashPool(script, 1);
    try {
      await expect(pool.hash('/nonexistent/path/file')).rejects.toBeInstanceOf(HashWorkerError);
      const dir = await mkdtemp(join(tmpdir(), 'mount-pool-'));
      await writeFile(join(dir, 'a'), 'a');
      expect(await pool.hash(join(dir, 'a'))).toBe(sha(Buffer.from('a')));
      await rm(dir, { recursive: true, force: true });
    } finally {
      await pool.stop();
    }
  });

  it('refuses a size below one and a request after stop', async () => {
    expect(() => new HashPool(script, 0)).toThrow(HashWorkerError);
    const pool = new HashPool(script, 1);
    await pool.stop();
    await expect(pool.hash('/x')).rejects.toBeInstanceOf(HashWorkerError);
  });
});

describe('the grouped settle', () => {
  function stubStore(): { store: Pick<Store, 'write'>; transactions: () => number } {
    let transactions = 0;
    let open = false;
    const write = <T>(work: () => T): T => {
      if (open) return work();
      open = true;
      transactions += 1;
      try {
        return work();
      } finally {
        open = false;
      }
    };
    return { store: { write }, transactions: () => transactions };
  }

  it('settles everything queued in one tick inside one transaction', async () => {
    const { store, transactions } = stubStore();
    const group = new SettleGroup(store, testLogger('drive'));
    const results = await Promise.all([
      group.run(() => 'a'),
      group.run(() => 'b'),
      group.run(() => 'c'),
    ]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(transactions()).toBe(1);
    await group.run(() => 'd');
    expect(transactions()).toBe(2);
  });

  it('fails only the item that throws and settles the rest', async () => {
    const { store } = stubStore();
    const group = new SettleGroup(store, testLogger('drive'));
    const outcomes = await Promise.allSettled([
      group.run(() => 'a'),
      group.run((): string => {
        throw new Error('bad');
      }),
      group.run(() => 'c'),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
  });
});

describe('a mounted commit', () => {
  let rig: MountRig;
  let mine: Attached;

  beforeEach(async () => {
    rig = await openMountRig(90_000, true);
    mine = await attachTo(
      rig,
      { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
      rig.posix.mine.id,
    );
  });

  afterEach(async () => {
    await rig.close();
  });

  function covered(parts: readonly (readonly [number, string])[]): number {
    const marked = new Set<number>();
    for (const [offset, value] of parts) {
      for (let at = offset; at < offset + Buffer.byteLength(value); at += 1) marked.add(at);
    }
    return marked.size;
  }

  async function written(
    name: string,
    parts: readonly (readonly [number, string])[],
    size: number,
  ): Promise<{ item: { sha256: string | null } | undefined; content: Buffer }> {
    const entry = await mine.client.created(mine.root, name);
    const { commit } = await mine.client.call('BEGIN', {
      ino: entry.ino,
      baseRev: entry.attr.rev,
      opKey: opKey(),
    });
    for (const [offset, value] of parts) {
      await mine.client.call('WRITE', { commit, offset }, new TextEncoder().encode(value));
    }
    await mine.client.call('END', {
      commit,
      size,
      length: covered(parts),
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    const found = rig.posix.opened.store.driveItems.byPath(rig.posix.mine.id, name, null);
    const item = found !== undefined && 'sha256' in found ? found : undefined;
    return { item, content: await readFile(join(rig.posix.mine.path, name)) };
  }

  it('stores the sha256 of the file for in-order writes', async () => {
    const { item, content } = await written(
      'in-order.txt',
      [
        [0, 'one '],
        [4, 'two '],
        [8, 'three'],
      ],
      13,
    );
    expect(content.toString()).toBe('one two three');
    expect(item?.sha256).toBe(sha(content));
  });

  it('stores the sha256 of the file for out-of-order writes', async () => {
    const { item, content } = await written(
      'out-of-order.txt',
      [
        [8, 'three'],
        [0, 'one '],
        [4, 'two '],
      ],
      13,
    );
    expect(content.toString()).toBe('one two three');
    expect(item?.sha256).toBe(sha(content));
  });

  it('stores the sha256 of the file after the size shrinks it', async () => {
    const { item, content } = await written('shrunk.txt', [[0, 'abcdefgh']], 4);
    expect(content.toString()).toBe('abcd');
    expect(item?.sha256).toBe(sha(content));
  });
});
