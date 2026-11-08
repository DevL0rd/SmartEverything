import { z } from 'zod';
import { DRIVE_VIA } from './feed';
import { DRIVE_ITEM } from './item';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_RECENT_FILTERS = ['everything', 'opened', 'added', 'changed'] as const;

export type DriveRecentFilter = (typeof DRIVE_RECENT_FILTERS)[number];

export const DRIVE_RECENT_QUERY = z
  .strictObject({
    filter: z.enum(DRIVE_RECENT_FILTERS),
    cursor: z.string().min(1).nullable(),
  })
  .readonly();

export type DriveRecentQuery = z.infer<typeof DRIVE_RECENT_QUERY>;

const WRITTEN = {
  item: DRIVE_ITEM,
  at: MOMENT,
  actorProfileId: ID.nullable(),
  via: z.enum(DRIVE_VIA),
  deviceId: ID.nullable(),
};

export const DRIVE_RECENT_ENTRY = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('opened'), item: DRIVE_ITEM, at: MOMENT }),
    z.strictObject({ kind: z.literal('added'), ...WRITTEN }),
    z.strictObject({ kind: z.literal('changed'), ...WRITTEN }),
  ])
  .readonly();

export type DriveRecentEntry = z.infer<typeof DRIVE_RECENT_ENTRY>;

export const DRIVE_RECENT_PAGE = z
  .strictObject({
    entries: z.array(DRIVE_RECENT_ENTRY).readonly(),
    next: z.string().min(1).nullable(),
  })
  .readonly();

export type DriveRecentPage = z.infer<typeof DRIVE_RECENT_PAGE>;
