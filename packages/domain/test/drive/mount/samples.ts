import { z } from 'zod';
import type { Message, MessageInput } from '../../../src/drive/mount';
import {
  ALLOCATE_MODES,
  INODE_TYPES,
  LOCK_TYPES,
  SEEK_WHENCE,
  SETATTR_VALID,
} from '../../../src/drive/mount';

const ROOT = '3f6f1a52-7c5b-4a77-9d5c-0a1f2d3e4b5c';
const PLACEMENT = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

function bytes(seed: number): Uint8Array {
  return Uint8Array.from({ length: 16 }, (_, index) => (seed + index * 7) & 0xff);
}

const ATTR = {
  ino: 42,
  type: INODE_TYPES.file,
  mode: 0o644,
  nlink: 2,
  uid: null,
  gid: 1000,
  size: 5_368_709_120,
  blocks: 10_485_760,
  atimeNs: 1_763_100_000_123_456_789n,
  mtimeNs: 1_763_100_001_000_000_000n,
  ctimeNs: 1_763_100_002_999_999_999n,
  btimeNs: 1_700_000_000_000_000_000n,
  rdev: 0,
  rev: 7,
  etag: 'W/"7"',
};

const DIRECTORY_ATTR = {
  ...ATTR,
  ino: 3,
  type: INODE_TYPES.directory,
  mode: 0o755,
  nlink: 4,
  size: 4096,
};

const LOCK = { type: LOCK_TYPES.write, start: 0n, end: 0xffff_ffff_ffff_ffffn, pid: 4321 };

const ENTRY = { ino: ATTR.ino, attr: ATTR };

const NAMED = { parent: 3, name: 'report.odt', mode: 0o640, uid: null, gid: null, opKey: bytes(1) };

export const REQUEST_SAMPLES = {
  HELLO: {
    session: bytes(9),
    seqs: [{ root: ROOT, seq: 811 }],
    handles: [{ handle: 12, ino: 42 }],
    locks: [{ ino: 42, owner: 0xdead_beef_cafe_f00dn, ...LOCK, flock: false }],
    commits: [5, 6],
  },
  ATTACH: { placementId: PLACEMENT },
  LEASE: { count: 4096 },
  LOOKUP: { parent: 3, name: 'notes.txt' },
  GETATTR: { ino: 42 },
  READDIR: { ino: 3, cursor: 0 },
  SETATTR: {
    ino: 42,
    valid:
      SETATTR_VALID.mode |
      SETATTR_VALID.uid |
      SETATTR_VALID.size |
      SETATTR_VALID.atime |
      SETATTR_VALID.mtime,
    mode: 0o600,
    uid: null,
    size: 1024,
    atime: 'now',
    mtime: 1_763_100_001_000_000_000n,
    opKey: bytes(2),
  },
  STATFS: { ino: 3 },
  READLINK: { ino: 44 },
  MKDIR: { ...NAMED, ino: 43, mtimeNs: 1_763_100_002_000_000_000n },
  CREATE: { ...NAMED, ino: 44, mtimeNs: 1_763_100_003_000_000_000n, fsync: false },
  MKNOD: { ...NAMED, name: 'pipe', ino: 47, type: INODE_TYPES.fifo, rdev: 0 },
  SYMLINK: {
    parent: 3,
    name: 'latest',
    ino: 48,
    target: '../releases/2026-11',
    uid: 1000,
    gid: 1000,
    opKey: bytes(3),
  },
  LINK: { ino: 42, parent: 3, name: 'second-name', opKey: bytes(4) },
  UNLINK: { parent: 3, name: 'old.txt', ino: 45, opKey: bytes(5) },
  RMDIR: { parent: 3, name: 'old-folder', ino: 46, opKey: bytes(6) },
  RMTREE: { parent: 3, name: 'old-tree', ino: 47, opKey: bytes(7), inodes: [48, 49, 50] },
  RENAME: {
    parent: 3,
    name: 'draft.tmp',
    newParent: 9,
    newName: 'draft.odt',
    flags: 1,
    opKey: bytes(7),
  },
  TMPFILE: { parent: 3, mode: 0o600, uid: null, gid: null, opKey: bytes(8) },
  GETXATTR: { ino: 42, name: 'user.comment' },
  SETXATTR: { ino: 42, name: 'user.comment', flags: 2, opKey: bytes(10) },
  LISTXATTR: { ino: 42 },
  REMOVEXATTR: { ino: 42, name: 'user.comment', opKey: bytes(11) },
  OPEN: { ino: 42 },
  READ: { handle: 12, offset: 4_294_967_296, length: 131_072 },
  RELEASE: { handle: 12 },
  SEEK: { handle: 12, offset: 8, whence: SEEK_WHENCE.hole },
  COPY: { srcHandle: 12, srcOffset: 0, commit: 5, dstOffset: 4096, length: 1_048_576 },
  ACCESS: { ino: 42, strict: false },
  BEGIN: { ino: 42, baseRev: 7, opKey: bytes(12) },
  WRITE: { commit: 5, offset: 65_536 },
  ALLOCATE: { commit: 5, mode: ALLOCATE_MODES.punchHole, offset: 4096, length: 8192 },
  STATE: { commit: 5 },
  END: {
    commit: 5,
    size: 5_368_709_120,
    length: 4096,
    mtimeNs: 1_700_000_000_123_456_789n,
    fsync: true,
    opKey: bytes(13),
  },
  PUT: {
    ino: 42,
    baseRev: 7,
    size: 11,
    mtimeNs: 1_700_000_000_987_654_321n,
    fsync: false,
    opKey: bytes(14),
  },

  ABORT: { commit: 5 },
  FORGET: { commits: [5, 6, 7] },
  FSYNC: { ino: 3, directory: true },
  GETLK: { ino: 42, owner: 0x0123_4567_89ab_cdefn, ...LOCK },
  SETLK: { ino: 42, owner: 0x0123_4567_89ab_cdefn, ...LOCK, wait: true, flock: false },
  UNLOCK: {
    ino: 42,
    owner: 0x0123_4567_89ab_cdefn,
    start: 0n,
    end: 0xffff_ffff_ffff_ffffn,
    flock: false,
  },
  CANCEL: { requestId: 0xfedc_ba98_7654_3210n },
} as const;

export const REQUEST_PAYLOADS: Readonly<Record<string, Uint8Array>> = {
  SETXATTR: new TextEncoder().encode('reviewed'),
  WRITE: Uint8Array.from({ length: 300 }, (_, index) => index & 0xff),
  PUT: new TextEncoder().encode('hello world'),
  CREATE: new TextEncoder().encode('new file'),
};

export const REPLY_SAMPLES = {
  HELLO: {
    session: bytes(9),
    resumed: true,
    leaseMs: 90_000,
    frameLimit: 1_048_576 + 262_144 + 16,
  },
  ATTACH: { root: ROOT, ino: 3, attr: DIRECTORY_ATTR, seq: 811 },
  LEASE: { start: 100_000, count: 4096 },
  LOOKUP: ENTRY,
  GETATTR: { attr: ATTR },
  READDIR: {
    entries: [
      ['a.txt', 42, ATTR],
      ['sub', 3, DIRECTORY_ATTR],
    ],
    next: null,
  },
  SETATTR: { attr: ATTR },
  STATFS: {
    blocks: 1_000_000,
    free: 400_000,
    avail: 350_000,
    files: 90_000,
    ffree: 80_000,
    bsize: 4096,
    namelen: 255,
  },
  READLINK: { target: '../releases/2026-11' },
  MKDIR: { ino: 3, attr: DIRECTORY_ATTR },
  CREATE: ENTRY,
  MKNOD: ENTRY,
  SYMLINK: ENTRY,
  LINK: { attr: ATTR },
  UNLINK: {},
  RMDIR: {},
  RMTREE: {},
  RENAME: {},
  TMPFILE: ENTRY,
  GETXATTR: {},
  SETXATTR: {},
  LISTXATTR: { names: ['user.comment', 'security.tag'] },
  REMOVEXATTR: {},
  OPEN: { handle: 12 },
  READ: {},
  RELEASE: {},
  SEEK: { offset: 16_384 },
  COPY: { copied: 1_048_576 },
  ACCESS: { attr: ATTR },
  BEGIN: {
    commit: 5,
    ranges: [
      [0, 4096],
      [65_536, 1024],
    ],
  },
  WRITE: {},
  ALLOCATE: {},
  STATE: { ranges: null },
  END: { attr: ATTR, rev: 7 },
  PUT: { attr: ATTR, rev: 7 },
  ABORT: {},
  FORGET: {},
  FSYNC: {},
  GETLK: { lock: LOCK },
  SETLK: {},
  UNLOCK: {},
  CANCEL: {},
} as const;

export const REPLY_PAYLOADS: Readonly<Record<string, Uint8Array>> = {
  GETXATTR: new TextEncoder().encode('reviewed'),
  READ: Uint8Array.from({ length: 4096 }, (_, index) => (index * 31) & 0xff),
};

export const PUSH_SAMPLES = {
  CHANGED: {
    root: ROOT,
    seq: 812,
    inodes: [42, 43],
    entries: [
      [3, 'a.txt'],
      [3, 'b.txt'],
    ],
    removed: [44],
  },
  RESET: { root: ROOT, seq: 900 },
  LOCK_LOST: { ino: 42, owner: 0xdead_beef_cafe_f00dn },
} as const;

export const ERROR_SAMPLES = {
  plain: { code: 1, message: 'no such file' },
  stale: { code: 14, message: 'base revision is old', rev: 9 },
} as const;

const INPUT = z.custom<MessageInput>();

export function inputOf(message: Message | object): MessageInput {
  return INPUT.parse(message);
}

export function sampleMessages(): ReadonlyMap<string, MessageInput> {
  const out = new Map<string, MessageInput>();
  const put = (name: string, message: object): void => {
    out.set(name, inputOf(message));
  };
  let id = 1n;
  for (const [op, meta] of Object.entries(REQUEST_SAMPLES)) {
    put(`${op.toLowerCase()}-request`, {
      type: 'request',
      op,
      requestId: id++,
      meta,
      payload: REQUEST_PAYLOADS[op],
    });
  }
  for (const [op, meta] of Object.entries(REPLY_SAMPLES)) {
    put(`${op.toLowerCase()}-reply`, {
      type: 'reply',
      op,
      requestId: id++,
      meta,
      payload: REPLY_PAYLOADS[op],
    });
  }
  put('readdir-reply-more', {
    type: 'reply',
    op: 'READDIR',
    requestId: id++,
    meta: { entries: [], next: 77 },
    more: true,
  });
  for (const [name, meta] of Object.entries(ERROR_SAMPLES)) {
    put(`error-${name}`, { type: 'error', op: 'END', requestId: id++, meta });
  }
  for (const [op, meta] of Object.entries(PUSH_SAMPLES)) {
    put(`push-${op.toLowerCase().replace('_', '-')}`, { type: 'push', op, requestId: 0n, meta });
  }
  return out;
}
