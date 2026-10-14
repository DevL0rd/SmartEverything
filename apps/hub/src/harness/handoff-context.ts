import { z } from 'zod';
import { AI_CHAT_ROW, AI_HARNESS_SESSION, AI_HARNESS_HANDOFF } from '@smarteverything/domain';
import { HARNESS_GRANT } from './grant';
export const HANDOFF_RESUME_CONTEXT = z.object({
  chat: AI_CHAT_ROW,
  local_client_id: z.uuid().optional(),
  grant: HARNESS_GRANT,
  session: AI_HARNESS_SESSION,
  controls: z.strictObject({ interrupt: z.uuid(), drain: z.uuid(), close: z.uuid() }),
});
export type HandoffResumeContext = z.infer<typeof HANDOFF_RESUME_CONTEXT>;
export const HANDOFF_PROGRESS = AI_HARNESS_HANDOFF.extend({
  resume_context: HANDOFF_RESUME_CONTEXT.optional(),
});
