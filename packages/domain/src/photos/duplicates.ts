import { z } from 'zod';
import { DRIVE_ITEM } from '../drive/item';
import { COUNT } from './shared';

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

export const DUPLICATE_GROUP = z
  .strictObject({
    sha256: SHA256,
    bytes: COUNT,
    keeperItemId: z.uuid(),
    reclaimableBytes: COUNT,
    items: z.array(DRIVE_ITEM).min(2).readonly(),
  })
  .refine((group) => group.items.some((item) => item.id === group.keeperItemId), {
    message: 'the suggested keeper is one of the group’s items',
    path: ['keeperItemId'],
  })
  .readonly();

export type DuplicateGroup = z.infer<typeof DUPLICATE_GROUP>;

export const DUPLICATE_KEEP_BEST = z
  .discriminatedUnion('scope', [
    z.strictObject({ scope: z.literal('groups'), sha256s: z.array(SHA256).min(1).readonly() }),
    z.strictObject({ scope: z.literal('all') }),
  ])
  .readonly();

export type DuplicateKeepBest = z.infer<typeof DUPLICATE_KEEP_BEST>;

export const DUPLICATE_KEEP_RESULT = z
  .strictObject({ groups: COUNT, trashed: COUNT, reclaimedBytes: COUNT })
  .readonly();

export const DUPLICATE_STATS = z
  .strictObject({
    groups: COUNT,
    extraCopies: COUNT,
    bytesBack: COUNT,
    sources: z
      .array(
        z
          .strictObject({
            rootId: z.uuid(),
            label: z.string(),
            copies: z.int().positive(),
            bytes: COUNT,
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

export type DuplicateStats = z.infer<typeof DUPLICATE_STATS>;

export const DUPLICATE_NOT = z
  .strictObject({ sha256s: z.array(SHA256).min(1).readonly() })
  .readonly();
