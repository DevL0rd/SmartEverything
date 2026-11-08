import { z } from 'zod';
import { COUNT, ID } from '../api/primitives';
import { DRIVE_VOLUME } from './root';

export const DRIVE_HOST_FOLDERS_QUERY = z.strictObject({ path: z.string().min(1).optional() });

export const DRIVE_HOST_FOLDER = z
  .strictObject({
    name: z.string().min(1),
    path: z.string().min(1),
    hidden: z.boolean(),
  })
  .readonly();

export const DRIVE_HOST_FOLDERS = z
  .strictObject({
    path: z.string().min(1).nullable(),
    parent: z.string().min(1).nullable(),
    folders: z.array(DRIVE_HOST_FOLDER).readonly(),
  })
  .readonly();

export type DriveHostFolders = z.infer<typeof DRIVE_HOST_FOLDERS>;

export const DRIVE_VOLUME_ENTRY = z
  .strictObject({
    mountId: DRIVE_VOLUME.unwrap().shape.mountId,
    fsType: DRIVE_VOLUME.unwrap().shape.fsType,
    network: DRIVE_VOLUME.unwrap().shape.network,
    mountPoint: z.string().min(1),
    totalBytes: COUNT,
    freeBytes: COUNT,
    rootIds: z.array(ID).readonly(),
  })
  .readonly();
