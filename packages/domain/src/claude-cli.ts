import { z } from 'zod';
import { AI_CHAT_ROW, AI_CHAT_TITLE_MAX } from './ai-chats';
import { AI_CHAT_PROVIDER } from './ai-provider';
import { CLAUDE_PROVIDER_OPTIONS } from './computer-ai';
import { CLAUDE_SETTABLE_MODE } from './claude';
import { ASSISTANT_NEW_MESSAGE } from './api/endpoints-assistant';
import { ID, MOMENT } from './api/primitives';

export const CLAUDE_CLI_START = z.strictObject({
  operation_id: ID,
  model: z.string().trim().min(1).max(200),
  effort: z.string().trim().min(1).max(32).nullable().default(null),
  title: z.string().trim().min(1).max(AI_CHAT_TITLE_MAX).optional(),
  settings: CLAUDE_PROVIDER_OPTIONS.extend({ cwd: z.string().trim().min(1).max(4096) }),
  message: ASSISTANT_NEW_MESSAGE,
});
export const CLAUDE_CLI_EXPECTED = {
  operation_id: ID,
  session_id: z.string().min(1).max(200).nullable(),
  job_id: ID.nullable(),
};
export const CLAUDE_CLI_ACTION = z.discriminatedUnion('action', [
  z.strictObject({
    ...CLAUDE_CLI_EXPECTED,
    action: z.literal('send'),
    message: ASSISTANT_NEW_MESSAGE,
  }),
  z.strictObject({
    ...CLAUDE_CLI_EXPECTED,
    action: z.literal('resume'),
    message: ASSISTANT_NEW_MESSAGE,
  }),
  z.strictObject({ ...CLAUDE_CLI_EXPECTED, action: z.literal('stop') }),
  z.strictObject({ ...CLAUDE_CLI_EXPECTED, action: z.literal('close') }),
  z.strictObject({
    ...CLAUDE_CLI_EXPECTED,
    action: z.literal('set_model'),
    model: z.string().trim().min(1).max(200),
  }),
  z.strictObject({
    ...CLAUDE_CLI_EXPECTED,
    action: z.literal('set_permission_mode'),
    mode: CLAUDE_SETTABLE_MODE,
  }),
]);
export const CLAUDE_CLI_SESSION = z.object({
  runtime: z.literal('claude'),
  chat: AI_CHAT_ROW,
  cwd: z.string().min(1).max(4096),
  online: z.boolean(),
  enabled: z.boolean(),
  provider: AI_CHAT_PROVIDER,
});
export const CLAUDE_CLI_RECEIPT = z.object({
  operation_id: ID,
  profile_id: ID,
  device_id: ID,
  runtime: z.literal('claude'),
  chat_id: ID,
  action: z.enum(['start', 'send', 'resume', 'stop', 'close', 'set_model', 'set_permission_mode']),
  state: z.enum(['pending', 'accepted', 'unknown']),
  session_id: z.string().nullable(),
  job_id: ID.nullable(),
  message_id: ID.nullable(),
  application: z.enum(['native', 'next_turn']).nullable(),
  reason: z.string().nullable(),
  created_at: MOMENT,
  updated_at: MOMENT,
});
export type ClaudeCliStart = z.infer<typeof CLAUDE_CLI_START>;
export type ClaudeCliAction = z.infer<typeof CLAUDE_CLI_ACTION>;
export type ClaudeCliSession = z.infer<typeof CLAUDE_CLI_SESSION>;
export type ClaudeCliReceipt = z.infer<typeof CLAUDE_CLI_RECEIPT>;
