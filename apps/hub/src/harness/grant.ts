import { z } from 'zod';
import {
  AI_MODEL_ROUTE_SELECTION,
  AI_HARNESS_TARGET,
  AI_HARNESS_PERMISSION,
  AI_HARNESS_STORAGE_BINDING,
} from '@smarteverything/domain';
import { HARNESS_AUTHORITY } from '@smarteverything/harness';
export const HARNESS_GRANT = z.strictObject({
  client_id: z.uuid().nullable(),
  event_id: z.uuid().nullable().default(null),
  role: z.enum(['owner', 'member']),
  session_id: z.string().min(1),
  profile_id: z.uuid(),
  target: AI_HARNESS_TARGET,
  runtime_instance: z.uuid(),
  generation: z.uuid(),
  authority: HARNESS_AUTHORITY,
  route: AI_MODEL_ROUTE_SELECTION,
  permission: AI_HARNESS_PERMISSION,
  cwd: z.string().min(1),
  storage_binding: AI_HARNESS_STORAGE_BINDING.optional(),
});
export type HarnessGrant = z.infer<typeof HARNESS_GRANT>;
