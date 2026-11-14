import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_UPLOAD_STATES = ['open', 'committing', 'complete', 'failed', 'expired'] as const;

export type DriveUploadState = (typeof DRIVE_UPLOAD_STATES)[number];

const DRIVE_TOP = z.strictObject({ kind: z.literal('drive'), rootId: ID });

const IN_FOLDER = z.strictObject({ kind: z.literal('folder'), folderId: ID });

export const DRIVE_FOLDER_PLACE = z.discriminatedUnion('kind', [DRIVE_TOP, IN_FOLDER]).readonly();

export type DriveFolderPlace = z.infer<typeof DRIVE_FOLDER_PLACE>;

export const DRIVE_UPLOAD_TARGET = z
  .discriminatedUnion('kind', [
    DRIVE_TOP,
    IN_FOLDER,
    z.strictObject({ kind: z.literal('item'), itemId: ID, baseRev: z.int().positive() }),
  ])
  .readonly();

export type DriveUploadTarget = z.infer<typeof DRIVE_UPLOAD_TARGET>;

const UPLOAD_METADATA_FIELDS = {
  filename: z
    .string()
    .min(1)
    .refine((name) => !name.includes('/') && !name.includes('\0') && name !== '.' && name !== '..'),
  filetype: z.string().min(1).optional(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
};

export const DRIVE_UPLOAD_METADATA = z
  .discriminatedUnion('targetKind', [
    z.strictObject({ ...UPLOAD_METADATA_FIELDS, targetKind: z.literal('drive'), rootId: ID }),
    z.strictObject({ ...UPLOAD_METADATA_FIELDS, targetKind: z.literal('folder'), folderId: ID }),
    z.strictObject({
      ...UPLOAD_METADATA_FIELDS,
      targetKind: z.literal('item'),
      itemId: ID,
      baseRev: z.string().regex(/^[1-9]\d*$/),
    }),
  ])
  .readonly();

export type DriveUploadMetadata = z.infer<typeof DRIVE_UPLOAD_METADATA>;

export const DRIVE_UPLOAD = z
  .strictObject({
    id: ID,
    rootId: ID,
    target: DRIVE_UPLOAD_TARGET,
    name: z.string().min(1),
    length: COUNT,
    offset: COUNT,
    state: z.enum(DRIVE_UPLOAD_STATES),
    failureReason: z.string().min(1).nullable(),
    profileId: ID,
    clientId: ID.nullable(),
    nodeId: ID.nullable(),
    createdAt: MOMENT,
    expiresAt: MOMENT,
  })
  .superRefine((upload, context) => {
    if (upload.offset > upload.length) {
      context.addIssue({
        code: 'custom',
        message: 'the offset cannot pass the length',
        path: ['offset'],
      });
    }
    if ((upload.clientId === null) === (upload.nodeId === null)) {
      context.addIssue({
        code: 'custom',
        message: 'an upload belongs to exactly one client or one computer node',
        path: ['clientId'],
      });
    }
    if ((upload.state === 'failed') !== (upload.failureReason !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'only a failed upload carries a reason',
        path: ['failureReason'],
      });
    }
    if (Date.parse(upload.expiresAt) <= Date.parse(upload.createdAt)) {
      context.addIssue({
        code: 'custom',
        message: 'expiresAt must be after createdAt',
        path: ['expiresAt'],
      });
    }
  })
  .readonly();

export type DriveUpload = z.infer<typeof DRIVE_UPLOAD>;
