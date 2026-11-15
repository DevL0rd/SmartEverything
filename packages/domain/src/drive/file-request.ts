import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_FILE_REQUEST_TOKEN = z.string().min(1);

export const DRIVE_FILE_REQUEST = z
  .strictObject({
    id: ID,
    folderItemId: ID,
    folderName: z.string().min(1),
    createdBy: ID,
    title: z.string().trim().min(1),
    message: z.string().trim().min(1).nullable(),
    expiresAt: MOMENT.nullable(),
    closedAt: MOMENT.nullable(),
    uploads: COUNT,
    bytes: COUNT,
    createdAt: MOMENT,
  })
  .readonly();

export type DriveFileRequest = z.infer<typeof DRIVE_FILE_REQUEST>;

export const DRIVE_FILE_REQUEST_CREATE = z
  .strictObject({
    folderItemId: ID,
    title: z.string().trim().min(1),
    message: z.string().trim().min(1).nullable(),
    expiresAt: MOMENT.nullable(),
  })
  .refine((request) => request.expiresAt === null || Date.parse(request.expiresAt) > Date.now(), {
    message: 'a request can only expire in the future',
    path: ['expiresAt'],
  })
  .readonly();

export type DriveFileRequestCreate = z.infer<typeof DRIVE_FILE_REQUEST_CREATE>;

export const DRIVE_FILE_REQUEST_CREATED = z
  .strictObject({
    request: DRIVE_FILE_REQUEST,
    url: z.url(),
    public: z.boolean(),
  })
  .readonly();

export type DriveFileRequestCreated = z.infer<typeof DRIVE_FILE_REQUEST_CREATED>;

export const DRIVE_FILE_REQUEST_CHANGE = z
  .strictObject({
    title: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).nullable().optional(),
    expiresAt: MOMENT.nullable().optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), {
    message: 'name at least one field to change',
  })
  .refine(
    (change) =>
      change.expiresAt === undefined ||
      change.expiresAt === null ||
      Date.parse(change.expiresAt) > Date.now(),
    { message: 'a request can only expire in the future', path: ['expiresAt'] },
  )
  .readonly();

export type DriveFileRequestChange = z.infer<typeof DRIVE_FILE_REQUEST_CHANGE>;

export const DRIVE_FILE_REQUEST_UPLOAD = z
  .strictObject({
    requestId: ID,
    itemId: ID,
    name: z.string().min(1),
    bytes: COUNT,
    uploaderName: z.string().trim().min(1),
    uploadedAt: MOMENT,
  })
  .readonly();

export type DriveFileRequestUpload = z.infer<typeof DRIVE_FILE_REQUEST_UPLOAD>;
