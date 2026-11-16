import { z } from 'zod';
import { OP_KEY_BYTES, SESSION_BYTES } from './ops';

export const META_KEYS = {
  code: 0,
  message: 1,
  rev: 2,
  session: 3,
  seqs: 4,
  handles: 5,
  locks: 6,
  commits: 7,
  resumed: 8,
  leaseMs: 9,
  frameLimit: 10,
  placementId: 11,
  root: 12,
  seq: 13,
  ino: 14,
  attr: 15,
  parent: 16,
  name: 17,
  cursor: 18,
  entries: 19,
  next: 20,
  valid: 21,
  mode: 22,
  uid: 23,
  gid: 24,
  size: 25,
  atime: 26,
  mtime: 27,
  opKey: 28,
  blocks: 29,
  free: 30,
  avail: 31,
  files: 32,
  ffree: 33,
  bsize: 34,
  namelen: 35,
  target: 36,
  count: 37,
  rdev: 38,
  type: 39,
  nlink: 40,
  atimeNs: 41,
  mtimeNs: 42,
  ctimeNs: 43,
  btimeNs: 44,
  etag: 45,
  newParent: 46,
  newName: 47,
  flags: 48,
  directory: 49,
  fsync: 50,
  handle: 51,
  offset: 52,
  length: 53,
  whence: 54,
  srcHandle: 55,
  srcOffset: 56,
  commit: 57,
  dstOffset: 58,
  copied: 59,
  baseRev: 60,
  ranges: 61,
  owner: 62,
  start: 63,
  end: 64,
  pid: 65,
  wait: 66,
  flock: 67,
  lock: 68,
  requestId: 69,
  inodes: 70,
  removed: 71,
  names: 72,
  strict: 73,
} as const;

export type MetaKeyName = keyof typeof META_KEYS;

export const ERROR_META_KEYS = ['code', 'message', 'rev'] as const satisfies readonly MetaKeyName[];

export const INODE_TYPES = {
  file: 1,
  directory: 2,
  symlink: 3,
  fifo: 4,
  socket: 5,
  char: 6,
  block: 7,
} as const;

export const SPECIAL_TYPES = [
  INODE_TYPES.fifo,
  INODE_TYPES.socket,
  INODE_TYPES.char,
  INODE_TYPES.block,
] as const;

export const SETATTR_VALID = { mode: 1, uid: 2, gid: 4, size: 8, atime: 16, mtime: 32 } as const;

export const LOCK_TYPES = { read: 1, write: 2 } as const;

export const SEEK_WHENCE = { data: 3, hole: 4 } as const;

export const ALLOCATE_MODES = {
  allocate: 0,
  keepSize: 1,
  punchHole: 2,
  zeroRange: 3,
  zeroRangeKeepSize: 4,
} as const;

export const RENAME_FLAGS = { noReplace: 1, exchange: 2, whiteout: 4 } as const;

export const XATTR_FLAGS = { create: 1, replace: 2 } as const;

export const NAME_MAX_BYTES = 255;

export const PATH_MAX_BYTES = 4096;

export const XATTR_NAME_MAX_BYTES = 255;

export const XATTR_SIZE_MAX_BYTES = 65_536;

export const XATTR_LIST_MAX_BYTES = 65_536;

export const END_OF_FILE = 0xffff_ffff_ffff_ffffn;

export const NOW = 'now';

const U64_MAX = 0xffff_ffff_ffff_ffffn;

const I64_MIN = -0x8000_0000_0000_0000n;

const I64_MAX = 0x7fff_ffff_ffff_ffffn;

const encoder = new TextEncoder();

export function utf8Bytes(value: string): number {
  return encoder.encode(value).length;
}

const decoder = new TextDecoder();

export function isWellFormed(value: string): boolean {
  return decoder.decode(encoder.encode(value)) === value;
}

export const COUNT = z.int().nonnegative();

export const UINT32 = z.int().min(0).max(0xffff_ffff);

export const INO = z.int().positive();

export const U64 = z
  .union([z.bigint().min(0n).max(U64_MAX), COUNT])
  .transform((value) => BigInt(value));

export const NS = z
  .union([z.bigint().min(I64_MIN).max(I64_MAX), z.int()])
  .transform((value) => BigInt(value));

export const MODE = z.int().min(0).max(0o7777);

export const UID = UINT32.nullable();

export const BYTES_16 = z.instanceof(Uint8Array).refine((value) => value.length === OP_KEY_BYTES);

export const OP_KEY = BYTES_16;

export const SESSION_ID = z
  .instanceof(Uint8Array)
  .refine((value) => value.length === SESSION_BYTES);

export const UUID = z.uuid();

export const ENTRY_NAME = z
  .string()
  .min(1)
  .refine(
    (value) => isWellFormed(value) && !/[/\0]/.test(value) && value !== '.' && value !== '..',
  );

export const LINK_TARGET = z
  .string()
  .min(1)
  .refine((value) => isWellFormed(value) && !value.includes('\0'))
  .refine((value) => utf8Bytes(value) <= PATH_MAX_BYTES);

export const XATTR_NAME = z
  .string()
  .min(1)
  .refine((value) => isWellFormed(value) && !value.includes('\0'))
  .refine((value) => utf8Bytes(value) <= XATTR_NAME_MAX_BYTES);

export const INODE_TYPE = z.literal(Object.values(INODE_TYPES));

export const SPECIAL_TYPE = z.literal(SPECIAL_TYPES);

export const LOCK_TYPE = z.literal(Object.values(LOCK_TYPES));

export const WHENCE = z.literal(Object.values(SEEK_WHENCE));

export const ALLOCATE_MODE = z.literal(Object.values(ALLOCATE_MODES));

export const ATTR = z
  .strictObject({
    ino: INO,
    type: INODE_TYPE,
    mode: MODE,
    nlink: COUNT,
    uid: UID,
    gid: UID,
    size: COUNT,
    blocks: COUNT,
    atimeNs: NS,
    mtimeNs: NS,
    ctimeNs: NS,
    btimeNs: NS,
    rdev: UINT32,
    rev: COUNT,
    etag: z.string().min(1),
  })
  .readonly();

export type Attr = z.output<typeof ATTR>;

export const RANGE = z.tuple([COUNT, COUNT.positive()]).readonly();

export const RANGES = z.array(RANGE).readonly();

export const ENTRY = z
  .strictObject({
    ino: INO,
    attr: ATTR,
  })
  .refine((value) => value.ino === value.attr.ino, 'ino must match attr.ino')
  .readonly();

export const LOCK_SHAPE = {
  type: LOCK_TYPE,
  start: U64,
  end: U64,
  pid: UINT32,
} as const;

export const LOCK_ORDER = (value: { readonly start: bigint; readonly end: bigint }): boolean =>
  value.start <= value.end;

export const LOCK = z
  .strictObject(LOCK_SHAPE)
  .refine(LOCK_ORDER, 'start must not exceed end')
  .readonly();

export const EMPTY = z.strictObject({}).readonly();
