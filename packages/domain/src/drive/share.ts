import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_SHARE_PERMISSIONS = ['view', 'download'] as const;

export type DriveSharePermission = (typeof DRIVE_SHARE_PERMISSIONS)[number];

export const DRIVE_SHARE = z
  .strictObject({
    id: ID,
    itemId: ID,
    permission: z.enum(DRIVE_SHARE_PERMISSIONS),
    expiresAt: MOMENT.nullable(),
    hasPassword: z.boolean(),
    createdBy: ID,
    revokedAt: MOMENT.nullable(),
    opens: COUNT,
    downloads: COUNT,
    lastOpenedAt: MOMENT.nullable(),
  })
  .readonly();

export type DriveShare = z.infer<typeof DRIVE_SHARE>;

export const DRIVE_SHARE_CREATE = z
  .strictObject({
    itemId: ID,
    permission: z.enum(DRIVE_SHARE_PERMISSIONS),
    expiresAt: MOMENT.nullable(),
    password: z.string().min(1).nullable(),
  })
  .readonly();

export type DriveShareCreate = z.infer<typeof DRIVE_SHARE_CREATE>;

export const DRIVE_SHARE_CREATED = z
  .strictObject({
    share: DRIVE_SHARE,
    url: z.url(),
    public: z.boolean(),
  })
  .readonly();

export type DriveShareCreated = z.infer<typeof DRIVE_SHARE_CREATED>;
