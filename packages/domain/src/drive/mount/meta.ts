import { z } from 'zod';
import { ERROR_CODES } from './codes';
import {
  ALLOCATE_MODE,
  ATTR,
  COUNT,
  EMPTY,
  ENTRY,
  ENTRY_NAME,
  INO,
  LINK_TARGET,
  LOCK,
  LOCK_ORDER,
  LOCK_SHAPE,
  MODE,
  NOW,
  NS,
  OP_KEY,
  RANGES,
  SESSION_ID,
  SETATTR_VALID,
  SPECIAL_TYPE,
  U64,
  UID,
  UINT32,
  UUID,
  WHENCE,
  XATTR_LIST_MAX_BYTES,
  XATTR_NAME,
  utf8Bytes,
} from './fields';
import { MAX_FRAME_BYTES, MAX_PAYLOAD_BYTES, type PushName, type RequestOpName } from './ops';

const HANDLE = COUNT;

const COMMIT = COUNT;

const FLAG = z.boolean();

const HELD_LOCK = z
  .strictObject({ ino: INO, owner: U64, ...LOCK_SHAPE, flock: FLAG })
  .refine(LOCK_ORDER, 'start must not exceed end')
  .readonly();

const TIME = z.union([NS, z.literal(NOW)]);

const ENTRY_PAIR = z.tuple([INO, ENTRY_NAME]).readonly();

const DIR_ENTRY = z
  .tuple([ENTRY_NAME, INO, ATTR])
  .refine(([, ino, attr]) => ino === attr.ino, 'ino must match attr.ino')
  .readonly();

const SETATTR_FIELDS = ['mode', 'uid', 'gid', 'size', 'atime', 'mtime'] as const;

const SETATTR = z
  .strictObject({
    ino: INO,
    valid: z.int().min(0).max(63),
    mode: MODE.optional(),
    uid: UID.optional(),
    gid: UID.optional(),
    size: COUNT.optional(),
    atime: TIME.optional(),
    mtime: TIME.optional(),
    opKey: OP_KEY,
  })
  .refine(
    (value) =>
      SETATTR_FIELDS.every(
        (field) => (value[field] !== undefined) === ((value.valid & SETATTR_VALID[field]) !== 0),
      ),
    'a field must be present exactly when its valid bit is set',
  )
  .readonly();

const CREATE_SHAPE = {
  parent: INO,
  mode: MODE,
  uid: UID,
  gid: UID,
  opKey: OP_KEY,
} as const;

const NAMED_CREATE_SHAPE = { ...CREATE_SHAPE, name: ENTRY_NAME } as const;

const LEASED_SHAPE = { ...NAMED_CREATE_SHAPE, ino: INO, mtimeNs: NS } as const;

const NAMED_REMOVE = z
  .strictObject({ parent: INO, name: ENTRY_NAME, ino: INO, opKey: OP_KEY })
  .readonly();

const SEQUENCES = z.array(z.strictObject({ root: UUID, seq: COUNT }).readonly()).readonly();

const LOCK_REQUEST_SHAPE = { ino: INO, owner: U64, ...LOCK_SHAPE } as const;

const XATTR_VALUE_FLAGS = z.literal([0, 1, 2]);

const rename = z
  .strictObject({
    parent: INO,
    name: ENTRY_NAME,
    newParent: INO,
    newName: ENTRY_NAME,
    flags: z.int().min(0).max(7),
    opKey: OP_KEY,
  })
  .readonly();

const END_REPLY = z.strictObject({ attr: ATTR, rev: COUNT }).readonly();

export const REQUEST_META = {
  HELLO: z
    .strictObject({
      session: SESSION_ID.nullable(),
      seqs: SEQUENCES,
      handles: z.array(z.strictObject({ handle: HANDLE, ino: INO }).readonly()).readonly(),
      locks: z.array(HELD_LOCK).readonly(),
      commits: z.array(COMMIT).readonly(),
    })
    .readonly(),
  ATTACH: z.strictObject({ placementId: UUID }).readonly(),
  LEASE: z.strictObject({ count: COUNT.positive() }).readonly(),
  LOOKUP: z.strictObject({ parent: INO, name: ENTRY_NAME }).readonly(),
  GETATTR: z.strictObject({ ino: INO }).readonly(),
  READDIR: z.strictObject({ ino: INO, cursor: COUNT }).readonly(),
  SETATTR,
  STATFS: z.strictObject({ ino: INO }).readonly(),
  READLINK: z.strictObject({ ino: INO }).readonly(),
  MKDIR: z.strictObject(LEASED_SHAPE).readonly(),
  CREATE: z
    .strictObject({ ...LEASED_SHAPE, atimeNs: NS.optional(), fsync: FLAG })
    .readonly(),
  MKNOD: z.strictObject({ ...NAMED_CREATE_SHAPE, type: SPECIAL_TYPE, rdev: UINT32 }).readonly(),
  SYMLINK: z
    .strictObject({
      parent: INO,
      name: ENTRY_NAME,
      target: LINK_TARGET,
      uid: UID,
      gid: UID,
      opKey: OP_KEY,
    })
    .readonly(),
  LINK: z.strictObject({ ino: INO, parent: INO, name: ENTRY_NAME, opKey: OP_KEY }).readonly(),
  UNLINK: NAMED_REMOVE,
  RMDIR: NAMED_REMOVE,
  RENAME: rename,
  TMPFILE: z.strictObject(CREATE_SHAPE).readonly(),
  GETXATTR: z.strictObject({ ino: INO, name: XATTR_NAME }).readonly(),
  SETXATTR: z
    .strictObject({ ino: INO, name: XATTR_NAME, flags: XATTR_VALUE_FLAGS, opKey: OP_KEY })
    .readonly(),
  LISTXATTR: z.strictObject({ ino: INO }).readonly(),
  REMOVEXATTR: z.strictObject({ ino: INO, name: XATTR_NAME, opKey: OP_KEY }).readonly(),
  OPEN: z.strictObject({ ino: INO }).readonly(),
  READ: z
    .strictObject({
      handle: HANDLE,
      offset: COUNT,
      length: z.int().positive().max(MAX_PAYLOAD_BYTES),
    })
    .readonly(),
  RELEASE: z.strictObject({ handle: HANDLE }).readonly(),
  SEEK: z.strictObject({ handle: HANDLE, offset: COUNT, whence: WHENCE }).readonly(),
  COPY: z
    .strictObject({
      srcHandle: HANDLE,
      srcOffset: COUNT,
      commit: COMMIT,
      dstOffset: COUNT,
      length: COUNT.positive(),
    })
    .readonly(),
  ACCESS: z.strictObject({ ino: INO, strict: FLAG }).readonly(),
  BEGIN: z.strictObject({ ino: INO, baseRev: COUNT, opKey: OP_KEY }).readonly(),
  WRITE: z.strictObject({ commit: COMMIT, offset: COUNT }).readonly(),
  ALLOCATE: z
    .strictObject({ commit: COMMIT, mode: ALLOCATE_MODE, offset: COUNT, length: COUNT.positive() })
    .readonly(),
  STATE: z.strictObject({ commit: COMMIT }).readonly(),
  END: z
    .strictObject({
      commit: COMMIT,
      size: COUNT,
      length: COUNT,
      mtimeNs: NS,
      atimeNs: NS.optional(),
      fsync: FLAG,
      opKey: OP_KEY,
    })
    .readonly(),
  PUT: z
    .strictObject({
      ino: INO,
      baseRev: COUNT,
      size: COUNT,
      mtimeNs: NS,
      atimeNs: NS.optional(),
      fsync: FLAG,
      opKey: OP_KEY,
    })
    .readonly(),
  ABORT: z.strictObject({ commit: COMMIT }).readonly(),
  FORGET: z.strictObject({ commits: z.array(COMMIT).readonly() }).readonly(),
  FSYNC: z.strictObject({ ino: INO, directory: FLAG }).readonly(),
  GETLK: z
    .strictObject(LOCK_REQUEST_SHAPE)
    .refine(LOCK_ORDER, 'start must not exceed end')
    .readonly(),
  SETLK: z
    .strictObject({ ...LOCK_REQUEST_SHAPE, wait: FLAG, flock: FLAG })
    .refine(LOCK_ORDER, 'start must not exceed end')
    .readonly(),
  UNLOCK: z
    .strictObject({ ino: INO, owner: U64, start: U64, end: U64, flock: FLAG })
    .refine(LOCK_ORDER, 'start must not exceed end')
    .readonly(),
  CANCEL: z.strictObject({ requestId: U64 }).readonly(),
} as const satisfies Record<RequestOpName, z.ZodType>;

export const REPLY_META = {
  HELLO: z
    .strictObject({
      session: SESSION_ID,
      resumed: FLAG,
      leaseMs: COUNT.positive(),
      frameLimit: z.int().min(MAX_FRAME_BYTES).max(MAX_FRAME_BYTES),
    })
    .readonly(),
  LEASE: z.strictObject({ start: INO, count: COUNT.positive() }).readonly(),
  ATTACH: z
    .strictObject({ root: UUID, ino: INO, attr: ATTR, seq: COUNT })
    .refine((value) => value.ino === value.attr.ino, 'ino must match attr.ino')
    .readonly(),
  LOOKUP: ENTRY,
  GETATTR: z.strictObject({ attr: ATTR }).readonly(),
  READDIR: z
    .strictObject({ entries: z.array(DIR_ENTRY).readonly(), next: COUNT.nullable() })
    .readonly(),
  SETATTR: z.strictObject({ attr: ATTR }).readonly(),
  STATFS: z
    .strictObject({
      blocks: COUNT,
      free: COUNT,
      avail: COUNT,
      files: COUNT,
      ffree: COUNT,
      bsize: z.int().positive(),
      namelen: z.int().positive(),
    })
    .readonly(),
  READLINK: z.strictObject({ target: LINK_TARGET }).readonly(),
  MKDIR: ENTRY,
  CREATE: ENTRY,
  MKNOD: ENTRY,
  SYMLINK: ENTRY,
  LINK: z.strictObject({ attr: ATTR }).readonly(),
  UNLINK: EMPTY,
  RMDIR: EMPTY,
  RENAME: EMPTY,
  TMPFILE: ENTRY,
  GETXATTR: EMPTY,
  SETXATTR: EMPTY,
  LISTXATTR: z
    .strictObject({ names: z.array(XATTR_NAME).readonly() })
    .refine(
      ({ names }) =>
        names.reduce((sum, name) => sum + utf8Bytes(name) + 1, 0) <= XATTR_LIST_MAX_BYTES,
      'the name list exceeds the xattr list limit',
    )
    .readonly(),
  REMOVEXATTR: EMPTY,
  OPEN: z.strictObject({ handle: HANDLE }).readonly(),
  READ: EMPTY,
  RELEASE: EMPTY,
  SEEK: z.strictObject({ offset: COUNT }).readonly(),
  COPY: z.strictObject({ copied: COUNT }).readonly(),
  ACCESS: z.strictObject({ attr: ATTR }).readonly(),
  BEGIN: z.strictObject({ commit: COMMIT, ranges: RANGES }).readonly(),
  WRITE: EMPTY,
  ALLOCATE: EMPTY,
  STATE: z.strictObject({ ranges: RANGES.nullable() }).readonly(),
  END: END_REPLY,
  PUT: END_REPLY,
  ABORT: EMPTY,
  FORGET: EMPTY,
  FSYNC: EMPTY,
  GETLK: z.strictObject({ lock: LOCK.nullable() }).readonly(),
  SETLK: EMPTY,
  UNLOCK: EMPTY,
  CANCEL: EMPTY,
} as const satisfies Record<RequestOpName, z.ZodType>;

export const PUSH_META = {
  CHANGED: z
    .strictObject({
      root: UUID,
      seq: COUNT,
      inodes: z.array(INO).readonly(),
      entries: z.array(ENTRY_PAIR).readonly(),
      removed: z.array(INO).readonly(),
    })
    .readonly(),
  RESET: z.strictObject({ root: UUID, seq: COUNT }).readonly(),
  LOCK_LOST: z.strictObject({ ino: INO, owner: U64 }).readonly(),
} as const satisfies Record<PushName, z.ZodType>;

export const ERROR_META = z
  .strictObject({
    code: z.literal(Object.values(ERROR_CODES)),
    message: z.string(),
    rev: COUNT.optional(),
  })
  .readonly();

export type RequestMeta<Name extends RequestOpName> = z.output<(typeof REQUEST_META)[Name]>;

export type RequestMetaInput<Name extends RequestOpName> = z.input<(typeof REQUEST_META)[Name]>;

export type ReplyMeta<Name extends RequestOpName> = z.output<(typeof REPLY_META)[Name]>;

export type ReplyMetaInput<Name extends RequestOpName> = z.input<(typeof REPLY_META)[Name]>;

export type PushMeta<Name extends PushName> = z.output<(typeof PUSH_META)[Name]>;

export type PushMetaInput<Name extends PushName> = z.input<(typeof PUSH_META)[Name]>;

export type ErrorMeta = z.output<typeof ERROR_META>;

export type ErrorMetaInput = z.input<typeof ERROR_META>;
