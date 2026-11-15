import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_BLOCK_COUNT,
  MAX_BLOCK_SIZE,
  MIN_BLOCK_SIZE,
  SYNC_CLIENT_MESSAGE,
  SYNC_HUB_MESSAGE,
  SYNC_MESSAGE,
  blockCount,
  blockRange,
  blockSizeFor,
  bytesToPacked,
  isValidBlockSize,
  packHashes,
  packedToBytes,
  syncMomentOfNs,
  unpackHashes,
} from '../../src/drive/sync';

const ID = '3f6f1a52-7c5b-4a77-9d5c-0a1f2d3e4b5c';
const OTHER = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const NOW = '2026-11-07T09:05:03.000Z';
const NOW_NS = '1794042303123456789';
const NOW_MS = '2026-11-07T09:05:03.123Z';
const HASH = 'ab'.repeat(32);

const push = {
  type: 'push',
  opId: 'op-1',
  relPath: 'a/b.txt',
  baseRev: null,
  meta: { bytes: 10, mtime: NOW_MS, mtimeNs: NOW_NS, blockSize: MIN_BLOCK_SIZE, blocksHash: HASH },
  blocks: HASH,
  mode: 0o755,
  xattrs: [{ name: 'user.note', value: 'aGk=' }],
  linkOf: null,
};

const entryBase = { mtime: NOW_MS, mtimeNs: NOW_NS, deleted: false, mode: 0o644, xattrs: [] };

const valid = [
  { type: 'hello', placementId: ID, indexId: null, afterSeq: 0 },
  {
    type: 'index',
    indexId: ID,
    seq: 4,
    last: true,
    entries: [
      { ...entryBase, itemId: ID, relPath: 'a', kind: 'folder', rev: 1, mode: 0o755 },
      {
        ...entryBase,
        itemId: OTHER,
        relPath: 'a/b.txt',
        kind: 'file',
        rev: 2,
        inode: 7,
        bytes: 10,
        blockSize: MIN_BLOCK_SIZE,
        blocksHash: HASH,
        xattrs: [{ name: 'user.note', value: 'aGk=' }],
      },
      {
        ...entryBase,
        itemId: ID,
        relPath: 'a/c',
        kind: 'link',
        rev: 1,
        inode: null,
        target: '../b.txt',
        mode: 0o777,
      },
    ],
  },
  { type: 'index_update', seq: 5, entries: [] },
  push,
  {
    type: 'push_meta',
    opId: 'op-4',
    relPath: 'a/b.txt',
    baseRev: 2,
    mode: 0o600,
    mtimeNs: NOW_NS,
    xattrs: [],
  },
  { type: 'push_link', opId: 'op-5', relPath: 'a/c', target: '../b.txt' },
  { type: 'accept', opId: 'op-1', rev: 3, seq: 6 },
  {
    type: 'conflict',
    opId: 'op-1',
    reason: 'stale',
    conflictPath: 'a/b.sync-conflict.txt',
    hubRev: 3,
  },
  { type: 'need_blocks', opId: 'op-1', txn: ID, indexes: [0, 2] },
  { type: 'commit', opId: 'op-1', txn: ID },
  { type: 'move', opId: 'op-2', from: 'a', to: 'b', baseRev: 1 },
  { type: 'tombstone', opId: 'op-3', relPath: 'a', baseRev: 1 },
  {
    type: 'client_state',
    need: 0,
    have: 10,
    errors: [{ relPath: null, message: 'disk full', at: NOW }],
  },
];

describe('sync messages', () => {
  it.each(valid)('accepts $type', (message) => {
    expect(SYNC_MESSAGE.safeParse(message).success).toBe(true);
  });

  it('refuses unknown kinds and extra fields', () => {
    expect(SYNC_MESSAGE.safeParse({ type: 'ping' }).success).toBe(false);
    expect(SYNC_MESSAGE.safeParse({ ...valid[0], extra: 1 }).success).toBe(false);
    expect(SYNC_MESSAGE.safeParse({ type: 'accept' }).success).toBe(false);
  });

  it('splits client and hub directions', () => {
    expect(SYNC_CLIENT_MESSAGE.safeParse(push).success).toBe(true);
    expect(SYNC_HUB_MESSAGE.safeParse(push).success).toBe(false);
    expect(SYNC_HUB_MESSAGE.safeParse(valid[6]).success).toBe(true);
    expect(SYNC_CLIENT_MESSAGE.safeParse(valid[6]).success).toBe(false);
  });

  it('refuses a push whose hashes do not match the size', () => {
    expect(SYNC_MESSAGE.safeParse({ ...push, blocks: '' }).success).toBe(false);
    expect(SYNC_MESSAGE.safeParse({ ...push, blocks: HASH + HASH }).success).toBe(false);
    expect(SYNC_MESSAGE.safeParse({ ...push, blocks: 'AB'.repeat(32) }).success).toBe(false);
    expect(
      SYNC_MESSAGE.safeParse({ ...push, meta: { ...push.meta, bytes: 0 }, blocks: '' }).success,
    ).toBe(true);
  });

  it('refuses an invalid block size and a move onto itself', () => {
    expect(
      SYNC_MESSAGE.safeParse({ ...push, meta: { ...push.meta, blockSize: 100_000 } }).success,
    ).toBe(false);
    expect(
      SYNC_MESSAGE.safeParse({ type: 'move', opId: 'x', from: 'a', to: 'a', baseRev: 1 }).success,
    ).toBe(false);
  });
});

describe('sync metadata', () => {
  it('ties the millisecond moment to the nanosecond stamp', () => {
    expect(syncMomentOfNs(NOW_NS)).toBe(NOW_MS);
    expect(
      SYNC_MESSAGE.safeParse({ ...push, meta: { ...push.meta, mtime: '2026-11-07T09:05:03.124Z' } })
        .success,
    ).toBe(false);
    expect(
      SYNC_MESSAGE.safeParse({ ...push, meta: { ...push.meta, mtimeNs: '12x' } }).success,
    ).toBe(false);
  });

  it('refuses a mode beyond the permission bits', () => {
    expect(SYNC_MESSAGE.safeParse({ ...push, mode: 0o10000 }).success).toBe(false);
    expect(SYNC_MESSAGE.safeParse({ ...push, mode: -1 }).success).toBe(false);
    expect(SYNC_MESSAGE.safeParse({ ...push, mode: 0o7777 }).success).toBe(true);
  });

  it('keeps extended attributes inside the stored namespaces and limits', () => {
    const withXattrs = (xattrs: unknown): boolean =>
      SYNC_MESSAGE.safeParse({ ...push, xattrs }).success;
    expect(withXattrs([{ name: 'trusted.a', value: '' }])).toBe(true);
    expect(withXattrs([{ name: 'security.selinux', value: 'AAAA' }])).toBe(true);
    expect(withXattrs([{ name: 'system.posix_acl_access', value: '' }])).toBe(false);
    expect(withXattrs([{ name: 'user.', value: '' }])).toBe(false);
    expect(withXattrs([{ name: 'user.a', value: 'not base64!' }])).toBe(false);
    expect(
      withXattrs([
        { name: 'user.a', value: '' },
        { name: 'user.a', value: '' },
      ]),
    ).toBe(false);
    expect(withXattrs([{ name: 'user.a', value: 'A'.repeat(87384) }])).toBe(false);
    expect(withXattrs([{ name: 'user.a', value: 'A'.repeat(87380) }])).toBe(true);
    expect(
      withXattrs([
        { name: `user.${'x'.repeat(250)}`, value: '' },
        ...Array.from({ length: 400 }, (_, index) => ({
          name: `user.${'y'.repeat(200)}${String(index)}`,
          value: '',
        })),
      ]),
    ).toBe(false);
  });

  it('refuses a link without a target and a link entry without one', () => {
    expect(SYNC_MESSAGE.safeParse({ type: 'push_link', opId: 'x', relPath: 'l' }).success).toBe(
      false,
    );
    expect(
      SYNC_MESSAGE.safeParse({
        type: 'push_link',
        opId: 'x',
        relPath: 'l',
        target: '',
      }).success,
    ).toBe(false);
    expect(
      SYNC_MESSAGE.safeParse({
        type: 'index_update',
        seq: 1,
        entries: [{ ...entryBase, itemId: ID, relPath: 'l', kind: 'link', rev: 1, inode: null }],
      }).success,
    ).toBe(false);
  });

  it('carries a hard link as a push naming an existing path', () => {
    expect(SYNC_CLIENT_MESSAGE.safeParse({ ...push, linkOf: 'a/other.txt' }).success).toBe(true);
    expect(SYNC_CLIENT_MESSAGE.safeParse({ ...push, linkOf: '' }).success).toBe(false);
  });

  it('refuses metadata messages from the hub side', () => {
    expect(SYNC_HUB_MESSAGE.safeParse(valid[4]).success).toBe(false);
    expect(SYNC_HUB_MESSAGE.safeParse(valid[5]).success).toBe(false);
    expect(SYNC_CLIENT_MESSAGE.safeParse(valid[4]).success).toBe(true);
    expect(SYNC_CLIENT_MESSAGE.safeParse(valid[5]).success).toBe(true);
  });
});

describe('block size rule', () => {
  it('accepts powers of two from 128 KiB to 16 MiB only', () => {
    expect(isValidBlockSize(MIN_BLOCK_SIZE)).toBe(true);
    expect(isValidBlockSize(MAX_BLOCK_SIZE)).toBe(true);
    expect(isValidBlockSize(MIN_BLOCK_SIZE / 2)).toBe(false);
    expect(isValidBlockSize(MAX_BLOCK_SIZE * 2)).toBe(false);
    expect(isValidBlockSize(MIN_BLOCK_SIZE * 3)).toBe(false);
    expect(isValidBlockSize(1.5 * MIN_BLOCK_SIZE)).toBe(false);
  });

  it('uses the smallest size that keeps the count below the limit', () => {
    expect(blockSizeFor(0)).toBe(MIN_BLOCK_SIZE);
    expect(blockSizeFor(MIN_BLOCK_SIZE * (MAX_BLOCK_COUNT - 1))).toBe(MIN_BLOCK_SIZE);
    expect(blockSizeFor(MIN_BLOCK_SIZE * MAX_BLOCK_COUNT)).toBe(MIN_BLOCK_SIZE * 2);
    expect(blockSizeFor(Number.MAX_SAFE_INTEGER)).toBe(MAX_BLOCK_SIZE);
  });

  it('keeps every file below the limit and minimal until the cap', () => {
    fc.assert(
      fc.property(fc.nat({ max: MAX_BLOCK_SIZE * (MAX_BLOCK_COUNT - 1) }), (bytes) => {
        const size = blockSizeFor(bytes);
        expect(isValidBlockSize(size)).toBe(true);
        expect(blockCount(bytes, size)).toBeLessThan(MAX_BLOCK_COUNT);
        if (size > MIN_BLOCK_SIZE)
          expect(blockCount(bytes, size / 2)).toBeGreaterThanOrEqual(MAX_BLOCK_COUNT);
      }),
    );
  });

  it('covers the file exactly with block ranges', () => {
    fc.assert(
      fc.property(fc.nat({ max: 5_000_000 }), (bytes) => {
        const count = blockCount(bytes, MIN_BLOCK_SIZE);
        let at = 0;
        for (let index = 0; index < count; index += 1) {
          const range = blockRange(bytes, MIN_BLOCK_SIZE, index);
          expect(range.start).toBe(at);
          at = range.end;
        }
        expect(at).toBe(bytes);
      }),
    );
    expect(() => blockRange(10, MIN_BLOCK_SIZE, 1)).toThrow(RangeError);
  });
});

describe('packed hashes', () => {
  const hash = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((bytes) => bytesToPacked(bytes));

  it('round trips through hex and bytes', () => {
    fc.assert(
      fc.property(fc.array(hash, { maxLength: 20 }), (hashes) => {
        const packed = packHashes(hashes);
        expect(unpackHashes(packed)).toEqual(hashes);
        expect(bytesToPacked(packedToBytes(packed))).toBe(packed);
        expect(packedToBytes(packed).length).toBe(hashes.length * 32);
      }),
    );
  });

  it('refuses malformed input', () => {
    expect(() => packHashes(['abc'])).toThrow(RangeError);
    expect(() => unpackHashes('ab')).toThrow(RangeError);
    expect(() => packedToBytes('AB'.repeat(32))).toThrow(RangeError);
    expect(() => bytesToPacked(new Uint8Array(31))).toThrow(RangeError);
  });
});
