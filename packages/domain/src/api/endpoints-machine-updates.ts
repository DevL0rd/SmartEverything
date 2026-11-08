import { z } from 'zod';
import {
  MACHINE_UPDATE_FILE,
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_NOTICE,
  MACHINE_UPDATE_OFFER,
  MACHINE_UPDATE_QUERY,
} from '../machine-updates';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const MACHINE_UPDATE_UPLOAD_PATH = '/api/machine-update/files/:file';

export const MACHINE_UPDATE_PUBLICATION = z.strictObject({
  manifest: MACHINE_UPDATE_MANIFEST,
  runtimeVersion: MACHINE_UPDATE_NOTICE.shape.runtimeVersion.optional(),
});

export const MACHINE_UPDATE_STAGED = z.strictObject({
  file: MACHINE_UPDATE_FILE,
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.int().positive(),
});

export type MachineUpdateStaged = z.infer<typeof MACHINE_UPDATE_STAGED>;

export type MachineUpdatePublication = z.infer<typeof MACHINE_UPDATE_PUBLICATION>;

export const MACHINE_UPDATE_ENDPOINTS = {
  readMachineUpdate: endpoint({
    method: 'GET',
    path: '/api/machine-update',
    access: 'member',
    summary:
      'Read the newest desktop app release this home offers for one platform and architecture, with short-lived download links, or null when no release is stored',
    params: NOTHING,
    query: MACHINE_UPDATE_QUERY,
    body: NO_BODY,
    response: MACHINE_UPDATE_OFFER.nullable(),
  }),
  publishMachineUpdate: endpoint({
    method: 'POST',
    path: '/api/machine-update',
    access: 'owner',
    summary:
      'Publish a desktop app release whose files were uploaded to PUT /api/machine-update/files/:file: every file is checked against the manifest size and sha256, then the release replaces the offered one and the previous release is kept',
    params: NOTHING,
    query: NOTHING,
    body: MACHINE_UPDATE_PUBLICATION,
    response: MACHINE_UPDATE_MANIFEST,
  }),
  rollbackMachineUpdate: endpoint({
    method: 'POST',
    path: '/api/machine-update/rollback',
    access: 'owner',
    summary:
      'Offer the previous desktop app release again; the release offered now becomes the previous one',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: MACHINE_UPDATE_MANIFEST,
  }),
  withdrawMachineUpdate: endpoint({
    method: 'DELETE',
    path: '/api/machine-update',
    access: 'owner',
    summary:
      'Stop offering any desktop app release; the previous release stays stored for a rollback',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
