import { z } from 'zod';
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

export const SYNC_CONFLICT_REASONS = ['stale', 'exists', 'missing', 'path'] as const;

export type SyncConflictReason = (typeof SYNC_CONFLICT_REASONS)[number];

export const SYNC_FILE_META = z
  .strictObject({
    bytes: COUNT,
    mtime: MOMENT,
    blockSize: BLOCK_SIZE,
    blocksHash: SHA256,
  })
  .readonly();

export type SyncFileMeta = z.infer<typeof SYNC_FILE_META>;

const FOLDER_ENTRY = z.strictObject({
  itemId: ID,
  relPath: REL_PATH,
  kind: z.literal('folder'),
  mtime: MOMENT,
  rev: COUNT,
  deleted: z.boolean(),
});

const FILE_ENTRY = z.strictObject({
  itemId: ID,
  relPath: REL_PATH,
  kind: z.literal('file'),
  mtime: MOMENT,
  rev: COUNT,
  deleted: z.boolean(),
  bytes: COUNT,
  blockSize: BLOCK_SIZE,
  blocksHash: SHA256,
});

export const SYNC_INDEX_ENTRY = z.discriminatedUnion('kind', [FOLDER_ENTRY, FILE_ENTRY]).readonly();

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
  })
  .refine(
    (push) => packedMatchesSize(push.blocks, push.meta.bytes, push.meta.blockSize),
    'blocks must hold one hash per block of the declared size',
  )
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
