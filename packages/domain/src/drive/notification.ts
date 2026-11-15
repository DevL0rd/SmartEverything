import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_NOTIFICATION_KINDS = [
  'shared',
  'edited',
  'commented',
  'mentioned',
  'replied',
  'access_requested',
  'access_answered',
  'file_request_upload',
  'transfer_offered',
  'transfer_answered',
] as const;

export type DriveNotificationKind = (typeof DRIVE_NOTIFICATION_KINDS)[number];

export const DRIVE_NOTIFICATION_KIND = z.enum(DRIVE_NOTIFICATION_KINDS);

export const DRIVE_NOTIFICATION = z
  .strictObject({
    id: ID,
    profileId: ID,
    kind: DRIVE_NOTIFICATION_KIND,
    itemId: ID,
    actorProfileId: ID.nullable(),
    actorName: z
      .string()
      .min(1)
      .nullable()
      .describe('The uploader’s typed name when nobody signed in caused it'),
    refId: ID.nullable(),
    count: z.int().positive(),
    createdAt: MOMENT,
    updatedAt: MOMENT,
    readAt: MOMENT.nullable(),
  })
  .refine(
    (row) =>
      row.kind === 'file_request_upload'
        ? row.actorProfileId === null && row.actorName !== null
        : row.actorProfileId !== null && row.actorName === null,
    { message: 'a person caused it, except an upload through a file request', path: ['actorName'] },
  )
  .readonly();

export type DriveNotification = z.infer<typeof DRIVE_NOTIFICATION>;

export const DRIVE_NOTIFICATIONS_READ = z
  .union([
    z.strictObject({ ids: z.array(ID).min(1).readonly() }),
    z.strictObject({ all: z.literal(true) }),
  ])
  .readonly();

export type DriveNotificationsRead = z.infer<typeof DRIVE_NOTIFICATIONS_READ>;
