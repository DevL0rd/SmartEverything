import { z } from 'zod';
import { DRIVE_ITEM } from './item';
import { DRIVE_SHARE } from './share';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_GRANT_ROLES = ['view', 'edit'] as const;

export const DRIVE_GRANT_ROLE = z.enum(DRIVE_GRANT_ROLES);

export type DriveGrantRole = z.infer<typeof DRIVE_GRANT_ROLE>;

export const DRIVE_GRANT = z
  .strictObject({
    id: ID,
    itemId: ID,
    profileId: ID,
    role: DRIVE_GRANT_ROLE,
    grantedBy: ID,
    createdAt: MOMENT,
  })
  .readonly();

export type DriveGrant = z.infer<typeof DRIVE_GRANT>;

export const DRIVE_GRANT_SET = z
  .strictObject({ itemId: ID, profileId: ID, role: DRIVE_GRANT_ROLE })
  .readonly();

export type DriveGrantSet = z.infer<typeof DRIVE_GRANT_SET>;

export const DRIVE_SHARED_WITH_ME_ENTRY = z
  .strictObject({
    item: DRIVE_ITEM,
    grant: DRIVE_GRANT,
  })
  .refine((entry) => entry.grant.itemId === entry.item.id, {
    message: 'the grant must be on the item',
    path: ['grant', 'itemId'],
  })
  .readonly();

export type DriveSharedWithMeEntry = z.infer<typeof DRIVE_SHARED_WITH_ME_ENTRY>;

export const DRIVE_SHARED_BY_ME_ENTRY = z
  .strictObject({
    item: DRIVE_ITEM,
    grants: z.array(DRIVE_GRANT).readonly(),
    links: z.array(DRIVE_SHARE).readonly(),
  })
  .refine(
    (entry) =>
      entry.grants.every((grant) => grant.itemId === entry.item.id) &&
      entry.links.every((link) => link.itemId === entry.item.id),
    { message: 'every grant and link must be on the item', path: ['item'] },
  )
  .readonly();

export type DriveSharedByMeEntry = z.infer<typeof DRIVE_SHARED_BY_ME_ENTRY>;
