import { z } from 'zod';
import { AI_PROJECT_PATH } from '@smarteverything/domain';
export const PROJECT_TRANSFER = z.strictObject({
  transfer_id: z.uuid(),
  path: AI_PROJECT_PATH,
  version: z.string().nullable(),
  encoding: z.enum(['utf8', 'base64']),
  total_bytes: z.int().positive(),
  received: z.int().nonnegative(),
  state: z.enum(['receiving', 'committed']),
});
