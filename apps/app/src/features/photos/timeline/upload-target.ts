import { z } from 'zod';
import { endpoint } from '@smarteverything/domain';
import { api } from '../../../api/transport';

const UPLOAD_TARGET = endpoint({
  method: 'POST',
  path: '/api/drive/photos/uploads/target',
  access: 'member',
  summary: 'The caller’s Uploads folder for photos and videos uploaded by hand',
  params: z.strictObject({}),
  query: z.strictObject({}),
  body: z.strictObject({ kind: z.literal('manual') }).readonly(),
  response: z.strictObject({ folderId: z.uuid(), path: z.string().min(1) }).readonly(),
});

export type UploadTarget = z.output<typeof UPLOAD_TARGET.response>;

export function resolveManualTarget(): Promise<UploadTarget> {
  return api().call(UPLOAD_TARGET, { body: { kind: 'manual' } });
}
