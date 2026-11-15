import { z } from 'zod';
import {
  LINK_TARGET,
  MODE,
  XATTR_LIST_MAX_BYTES,
  XATTR_NAME,
  XATTR_SIZE_MAX_BYTES,
  utf8Bytes,
} from '../mount/fields';
import { DRIVE_SYNC_ERROR } from '../placement';
import { isValidBlockSize, packedMatchesSize } from './blocks';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();
const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);
const REL_PATH = z.string().min(1);
const OP_ID = z.string().min(1);
const BLOCK_SIZE = z
  .int()
  .refine(isValidBlockSize, 'block size must be a power of two from 128 KiB to 16 MiB');
const PACKED = z.string().regex(/^(?:[0-9a-f]{64})*$/);

const NS = z.string().regex(/^\d{1,19}$/);
const BASE64 = z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const XATTR_NAMESPACES = ['user.', 'trusted.', 'security.'] as const;
const NS_PER_MS = 1_000_000n;

export function syncMomentOfNs(mtimeNs: string): string {
  return new Date(Number(BigInt(mtimeNs) / NS_PER_MS)).toISOString();
}

function decodedBytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export const SYNC_XATTR = z
  .strictObject({
    name: XATTR_NAME.refine((value) =>
      XATTR_NAMESPACES.some((prefix) => value.startsWith(prefix) && value.length > prefix.length),
    ),
    value: BASE64.refine((value) => decodedBytes(value) <= XATTR_SIZE_MAX_BYTES),
  })
  .readonly();

export type SyncXattr = z.infer<typeof SYNC_XATTR>;

export const SYNC_XATTRS = z
  .array(SYNC_XATTR)
  .refine((xattrs) => new Set(xattrs.map((xattr) => xattr.name)).size === xattrs.length)
  .refine(
    (xattrs) =>
      xattrs.reduce((sum, xattr) => sum + utf8Bytes(xattr.name) + 1, 0) <= XATTR_LIST_MAX_BYTES,
  )
  .readonly();

export const SYNC_CONFLICT_REASONS = ['stale', 'exists', 'missing', 'path'] as const;

export type SyncConflictReason = (typeof SYNC_CONFLICT_REASONS)[number];

export const SYNC_FILE_META = z
  .strictObject({
    bytes: COUNT,
    mtime: MOMENT,
    mtimeNs: NS,
    blockSize: BLOCK_SIZE,
    blocksHash: SHA256,
  })
  .refine(
    (meta) =>
      NS.safeParse(meta.mtimeNs).success &&
      MOMENT.safeParse(meta.mtime).success &&
      syncMomentOfNs(meta.mtimeNs) === new Date(meta.mtime).toISOString(),
    'mtime must be the millisecond moment of mtimeNs',
  )
  .readonly();

export type SyncFileMeta = z.infer<typeof SYNC_FILE_META>;

const ENTRY_BASE = {
  itemId: ID,
  relPath: REL_PATH,
  mtime: MOMENT,
  mtimeNs: NS,
  rev: COUNT,
  deleted: z.boolean(),
  mode: MODE,
  xattrs: SYNC_XATTRS,
};

const FOLDER_ENTRY = z.strictObject({
  ...ENTRY_BASE,
  kind: z.literal('folder'),
});

const FILE_ENTRY = z.strictObject({
  ...ENTRY_BASE,
  kind: z.literal('file'),
  inode: COUNT.nullable(),
  bytes: COUNT,
  blockSize: BLOCK_SIZE,
  blocksHash: SHA256,
});

const LINK_ENTRY = z.strictObject({
  ...ENTRY_BASE,
  kind: z.literal('link'),
  inode: COUNT.nullable(),
  target: LINK_TARGET,
});

export const SYNC_INDEX_ENTRY = z
  .discriminatedUnion('kind', [FOLDER_ENTRY, FILE_ENTRY, LINK_ENTRY])
  .readonly();

export type SyncIndexEntry = z.infer<typeof SYNC_INDEX_ENTRY>;

const ENTRIES = z.array(SYNC_INDEX_ENTRY).readonly();

export const SYNC_HELLO = z
  .strictObject({
    type: z.literal('hello'),
    placementId: ID,
    indexId: ID.nullable(),
    afterSeq: COUNT,
  })
  .readonly();

export const SYNC_INDEX = z
  .strictObject({
    type: z.literal('index'),
    indexId: ID,
    seq: COUNT,
    entries: ENTRIES,
    last: z.boolean(),
  })
  .readonly();

export const SYNC_INDEX_UPDATE = z
  .strictObject({
    type: z.literal('index_update'),
    seq: COUNT,
    entries: ENTRIES,
  })
  .readonly();

export const SYNC_PUSH = z
  .strictObject({
    type: z.literal('push'),
    opId: OP_ID,
    relPath: REL_PATH,
    baseRev: COUNT.nullable(),
    meta: SYNC_FILE_META,
    blocks: PACKED,
    mode: MODE,
    xattrs: SYNC_XATTRS,
    linkOf: REL_PATH.nullable(),
  })
  .refine(
    (push) => packedMatchesSize(push.blocks, push.meta.bytes, push.meta.blockSize),
    'blocks must hold one hash per block of the declared size',
  )
  .readonly();

export const SYNC_PUSH_META = z
  .strictObject({
    type: z.literal('push_meta'),
    opId: OP_ID,
    relPath: REL_PATH,
    baseRev: COUNT,
    mode: MODE,
    mtimeNs: NS,
    xattrs: SYNC_XATTRS,
  })
  .readonly();

export const SYNC_PUSH_LINK = z
  .strictObject({
    type: z.literal('push_link'),
    opId: OP_ID,
    relPath: REL_PATH,
    target: LINK_TARGET,
  })
  .readonly();

export const SYNC_ACCEPT = z
  .strictObject({
    type: z.literal('accept'),
    opId: OP_ID,
    rev: COUNT,
    seq: COUNT,
  })
  .readonly();

export const SYNC_CONFLICT = z
  .strictObject({
    type: z.literal('conflict'),
    opId: OP_ID,
    reason: z.enum(SYNC_CONFLICT_REASONS),
    conflictPath: REL_PATH.nullable(),
    hubRev: COUNT,
  })
  .readonly();

export const SYNC_NEED_BLOCKS = z
  .strictObject({
    type: z.literal('need_blocks'),
    opId: OP_ID,
    txn: ID,
    indexes: z.array(COUNT).readonly(),
  })
  .readonly();

export const SYNC_COMMIT = z
  .strictObject({
    type: z.literal('commit'),
    opId: OP_ID,
    txn: ID,
  })
  .readonly();

export const SYNC_MOVE = z
  .strictObject({
    type: z.literal('move'),
    opId: OP_ID,
    from: REL_PATH,
    to: REL_PATH,
    baseRev: COUNT,
  })
  .refine((move) => move.from !== move.to, 'move needs two different paths')
  .readonly();

export const SYNC_TOMBSTONE = z
  .strictObject({
    type: z.literal('tombstone'),
    opId: OP_ID,
    relPath: REL_PATH,
    baseRev: COUNT,
  })
  .readonly();

export const SYNC_CLIENT_STATE = z
  .strictObject({
    type: z.literal('client_state'),
    need: COUNT,
    have: COUNT,
    errors: z.array(DRIVE_SYNC_ERROR).readonly(),
  })
  .readonly();

export const SYNC_CLIENT_MESSAGE = z.discriminatedUnion('type', [
  SYNC_HELLO,
  SYNC_PUSH,
  SYNC_PUSH_META,
  SYNC_PUSH_LINK,
  SYNC_COMMIT,
  SYNC_MOVE,
  SYNC_TOMBSTONE,
  SYNC_CLIENT_STATE,
]);

export const SYNC_HUB_MESSAGE = z.discriminatedUnion('type', [
  SYNC_INDEX,
  SYNC_INDEX_UPDATE,
  SYNC_ACCEPT,
  SYNC_CONFLICT,
  SYNC_NEED_BLOCKS,
]);

export const SYNC_MESSAGE = z.discriminatedUnion('type', [
  SYNC_HELLO,
  SYNC_INDEX,
  SYNC_INDEX_UPDATE,
  SYNC_PUSH,
  SYNC_PUSH_META,
  SYNC_PUSH_LINK,
  SYNC_ACCEPT,
  SYNC_CONFLICT,
  SYNC_NEED_BLOCKS,
  SYNC_COMMIT,
  SYNC_MOVE,
  SYNC_TOMBSTONE,
  SYNC_CLIENT_STATE,
]);

export type SyncMessage = z.infer<typeof SYNC_MESSAGE>;
export type SyncClientMessage = z.infer<typeof SYNC_CLIENT_MESSAGE>;
export type SyncHubMessage = z.infer<typeof SYNC_HUB_MESSAGE>;
