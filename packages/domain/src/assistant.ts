import { z } from 'zod';
import { AI_MESSAGE_FIELDS, CHAT_STEP_OUTCOMES } from './ai-chats';
import { ASSISTANT_VOICE_SETTINGS } from './assistant-voice';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const ASSISTANT_TEXT_MAX = 16_000;
export const ASSISTANT_STEP_MAX = 200;
export const ASSISTANT_STEPS_KEPT = 40;
export const ASSISTANT_ATTACHMENTS_MAX = 10;
export const ASSISTANT_ATTACHMENT_BYTES_MAX = 25 * 1024 * 1024;
export const ASSISTANT_UPLOAD_CHUNK_BYTES = 512 * 1024;
export const ASSISTANT_MESSAGES_SNAPSHOT = 60;
export const ASSISTANT_NAME_MAX = 40;
export const ASSISTANT_INSTRUCTIONS_MAX = 8000;

export const ASSISTANT_NAME = z.string().trim().min(1).max(ASSISTANT_NAME_MAX);

export const REUSE_CHAT_MINUTES = 120;

export const COMPACT_AT_PERCENT = { min: 50, max: 95, step: 5, fallback: 85 } as const;

export const ASSISTANT_SETTINGS = z.strictObject({
  instructions: z.string().max(ASSISTANT_INSTRUCTIONS_MAX).default(''),
  activity_steps: z.boolean().default(true),
  name: ASSISTANT_NAME.nullable().default('Coordinator'),
  aliases: z.array(ASSISTANT_NAME).max(10).default([]),
  voice: ASSISTANT_VOICE_SETTINGS.prefault({}),
  compact_at_percent: z
    .int()
    .min(COMPACT_AT_PERCENT.min)
    .max(COMPACT_AT_PERCENT.max)
    .default(COMPACT_AT_PERCENT.fallback),
  reuse_chat_minutes: z
    .int()
    .min(0)
    .max(1440)
    .default(REUSE_CHAT_MINUTES)
    .describe(
      'Conversations the AI starts (calls, camera and channel talks, wake words) continue the person’s latest conversation chat if it was active within this many minutes; 0 starts a new chat every time',
    ),
  reply_cost: z.boolean().default(true).describe('Show what each reply cost under it in the chat'),
  reply_suggestions: z
    .boolean()
    .default(false)
    .describe(
      'After a reply in an app chat, ask a cheap model for up to three short follow-up replies to offer as taps; costs a little per reply',
    ),
  web_search_default: z
    .boolean()
    .default(false)
    .describe(
      'Whether text chats and live voice may search the web unless a chat says otherwise; each chat can override it, and each search costs a little',
    ),
  claude_link_auto: z
    .boolean()
    .default(true)
    .describe(
      'When the hub starts and Claude Desktop is on this computer, install or repair the SmartEverything link in it automatically; false leaves the link as it is',
    ),
});

export type AssistantSettings = z.output<typeof ASSISTANT_SETTINGS>;

export const ASSISTANT_SETTINGS_CHANGE = ASSISTANT_SETTINGS.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: 'name at least one field to change' },
);

export type AssistantSettingsChange = z.output<typeof ASSISTANT_SETTINGS_CHANGE>;

export const ASSISTANT_MESSAGE_ROLES = ['person', 'responder', 'system'] as const;

export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLES)[number];

export const ASSISTANT_MESSAGE_KINDS = ['text', 'update', 'action', 'call'] as const;

export type AssistantMessageKind = (typeof ASSISTANT_MESSAGE_KINDS)[number];

export const ASSISTANT_REQUEST_STATES = [
  'queued',
  'delivered',
  'working',
  'answered',
  'failed',
] as const;

export type AssistantRequestState = (typeof ASSISTANT_REQUEST_STATES)[number];

export const ASSISTANT_REASON_CODES = [
  'credits',
  'rate_limit',
  'model_unavailable',
  'offline',
  'interrupted',
  'stopped',
  'unknown',
] as const;

export type AssistantReasonCode = (typeof ASSISTANT_REASON_CODES)[number];

export const ASSISTANT_ATTACHMENT = z.strictObject({
  id: ID,
  name: z.string().min(1).max(200),
  mime: z.string().min(3).max(120),
  bytes: z.int().min(1).max(ASSISTANT_ATTACHMENT_BYTES_MAX),
  width: z.int().min(1).nullable(),
  height: z.int().min(1).nullable(),
});

export type AssistantAttachment = z.infer<typeof ASSISTANT_ATTACHMENT>;

export const ASSISTANT_MESSAGE_ROW = z.strictObject({
  id: ID,
  profile_id: ID,
  client_id: ID.nullable(),
  role: z.enum(ASSISTANT_MESSAGE_ROLES),
  kind: z.enum(ASSISTANT_MESSAGE_KINDS),
  author: z.string().min(1).max(120),
  text: z.string().max(ASSISTANT_TEXT_MAX),
  attachments: z.array(ASSISTANT_ATTACHMENT).max(ASSISTANT_ATTACHMENTS_MAX),
  state: z.enum(ASSISTANT_REQUEST_STATES).nullable(),
  reason: z.string().max(400).nullable(),
  reason_code: z
    .enum(ASSISTANT_REASON_CODES)
    .nullable()
    .default(null)
    .describe(
      'Why the message failed, in a form an app can offer a fix for; null while it has not',
    ),
  client_message_id: ID.nullable()
    .default(null)
    .describe('The id the sending app gave this message, so a resend never duplicates it'),
  steps: z.array(z.string().min(1).max(ASSISTANT_STEP_MAX)).max(ASSISTANT_STEPS_KEPT),
  step_states: z
    .array(z.enum(CHAT_STEP_OUTCOMES))
    .max(ASSISTANT_STEPS_KEPT)
    .default([])
    .describe('How each step ended, in the order of steps; a step with no entry finished fine'),
  reply_to: ID.nullable(),
  ...AI_MESSAGE_FIELDS,
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type AssistantMessageRow = z.infer<typeof ASSISTANT_MESSAGE_ROW>;

const RETIRED_FAILED_ACTION_PREFIX = 'Couldn’t do this: ';

export function isRetiredFailedAction(row: Pick<AssistantMessageRow, 'kind' | 'text'>): boolean {
  return row.kind === 'action' && row.text.startsWith(RETIRED_FAILED_ACTION_PREFIX);
}

export const ASSISTANT_STATUS = z.strictObject({
  settings: ASSISTANT_SETTINGS,
  responder: z.looseObject({}).optional(),
  apps: z.array(z.unknown()).optional(),
  desktop_available: z.boolean().optional(),
});

export type AssistantStatus = z.infer<typeof ASSISTANT_STATUS>;

export const RETIRED_STATUS_FIELDS: Pick<
  AssistantStatus,
  'responder' | 'apps' | 'desktop_available'
> = {
  responder: { mode: 'none', state: 'none', reason: null, conversation: null },
  apps: [],
  desktop_available: false,
};

export const ASSISTANT_STATUS_NOTICE = z.strictObject({
  type: z.literal('assistant_status'),
  status: ASSISTANT_STATUS,
});

export type AssistantStatusNotice = z.infer<typeof ASSISTANT_STATUS_NOTICE>;

export const ASSISTANT_REPLY_PUSH_DATA = z.strictObject({
  kind: z.literal('assistant_reply'),
  messageId: ID,
});

export type AssistantReplyPushData = z.infer<typeof ASSISTANT_REPLY_PUSH_DATA>;

export function assistantLabel(settings: Pick<AssistantSettings, 'name'>): string {
  return settings.name ?? 'Coordinator';
}
