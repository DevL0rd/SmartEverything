import { z } from 'zod';
import { PLUGIN_REQUESTERS } from '@smarteverything/domain';
export const CONVERSATION_AUTHORITY = z.object({
  event_id: z.uuid(),
  profile_id: z.uuid(),
  client_id: z.uuid().nullable(),
  kind: z.enum(['client', 'service']),
  role: z.enum(['owner', 'member']).optional(),
  hub_os_ban: z.boolean(),
  tools: z.array(z.string()).nullable(),
  plugin_id: z.string().nullable(),
  requester: z.enum(PLUGIN_REQUESTERS).nullable(),
});
export type ConversationAuthority = z.infer<typeof CONVERSATION_AUTHORITY>;
