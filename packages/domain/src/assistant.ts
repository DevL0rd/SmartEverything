import { z } from 'zod';
import { AI_MESSAGE_FIELDS, ENGINE_KIND } from './ai-chats';
import { ASSISTANT_VOICE_SETTINGS } from './assistant-voice';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const RESPONDER_MODES = ['claude-session', 'codex-local', 'none'] as const;

export type ResponderMode = (typeof RESPONDER_MODES)[number];

const RETIRED_MODES: Readonly<Record<string, ResponderMode>> = { 'manual-mcp': 'none' };

export const RESPONDER_MODE = z.preprocess(
  (mode) => (typeof mode === 'string' ? (RETIRED_MODES[mode] ?? mode) : mode),
  z.enum(RESPONDER_MODES),
);

export const RESPONDER_APPS = ['claude-code', 'codex'] as const;

export type ResponderApp = (typeof RESPONDER_APPS)[number];

export const RESPONDER_APP = z.enum(RESPONDER_APPS);

export const RESPONDER_APP_OF: Readonly<Record<ResponderMode, ResponderApp | null>> = {
  'claude-session': 'claude-code',
  'codex-local': 'codex',
  none: null,
};

export const RESPONDER_LABELS: Readonly<Record<ResponderMode, string>> = {
  'claude-session': 'Claude Code',
  'codex-local': 'Codex',
  none: 'None',
};

export const ASSISTANT_TEXT_MAX = 16_000;
export const ASSISTANT_STEP_MAX = 200;
export const ASSISTANT_STEPS_KEPT = 40;
export const ASSISTANT_ATTACHMENTS_MAX = 10;
export const ASSISTANT_ATTACHMENT_BYTES_MAX = 25 * 1024 * 1024;
export const ASSISTANT_UPLOAD_CHUNK_BYTES = 512 * 1024;
export const ASSISTANT_MESSAGES_SNAPSHOT = 60;
export const ASSISTANT_NAME_MAX = 40;
export const ASSISTANT_INSTRUCTIONS_MAX = 8000;

export const ASSISTANT_EFFORT = z.string().trim().min(1).max(32);

export const ASSISTANT_MODEL = z.string().trim().min(1).max(200);

export const ASSISTANT_NAME = z.string().trim().min(1).max(ASSISTANT_NAME_MAX);

export const REUSE_CHAT_MINUTES = 120;

export const COMPACT_AT_PERCENT = { min: 50, max: 95, step: 5, fallback: 85 } as const;

export const ASSISTANT_SETTINGS = z.strictObject({
  mode: RESPONDER_MODE.default('none'),
  workspace: z.string().trim().min(1).max(1024).nullable().default(null),
  default_engine: ENGINE_KIND.default('openrouter'),
  background_only: z.boolean().default(false),
  conversation_model: ASSISTANT_MODEL.nullable().default(null),
  conversation_effort: ASSISTANT_EFFORT.nullable().default(null),
  new_chat_model: ASSISTANT_MODEL.nullable().default(null),
  new_chat_effort: ASSISTANT_EFFORT.nullable().default(null),
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
  steps: z.array(z.string().min(1).max(ASSISTANT_STEP_MAX)).max(ASSISTANT_STEPS_KEPT),
  reply_to: ID.nullable(),
  ...AI_MESSAGE_FIELDS,
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type AssistantMessageRow = z.infer<typeof ASSISTANT_MESSAGE_ROW>;

export const RESPONDER_STATES = ['none', 'ready', 'working', 'starting', 'unavailable'] as const;

export type ResponderState = (typeof RESPONDER_STATES)[number];

export const RESPONDER_PLACES = ['desktop', 'terminal', 'background', 'codex'] as const;

export const RESPONDER_CONVERSATION = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  live: z.boolean(),
  place: z.enum(RESPONDER_PLACES).nullable(),
});

export type ResponderConversation = z.infer<typeof RESPONDER_CONVERSATION>;

export const RESPONDER_STATUS = z.strictObject({
  mode: RESPONDER_MODE,
  state: z.enum(RESPONDER_STATES),
  reason: z.string().max(400).nullable(),
  conversation: RESPONDER_CONVERSATION.nullable(),
});

export type ResponderStatus = z.infer<typeof RESPONDER_STATUS>;

export const RESPONDER_APP_STATES = [
  'not_installed',
  'not_connected',
  'connected',
  'needs_repair',
] as const;

export type ResponderAppState = (typeof RESPONDER_APP_STATES)[number];

export const RESPONDER_APP_STATUS = z.strictObject({
  app: RESPONDER_APP,
  state: z.enum(RESPONDER_APP_STATES),
  detail: z.string().max(400).nullable(),
  token_id: ID.nullable(),
});

export type ResponderAppStatus = z.infer<typeof RESPONDER_APP_STATUS>;

export const ASSISTANT_STATUS = z.strictObject({
  settings: ASSISTANT_SETTINGS,
  responder: RESPONDER_STATUS,
  apps: z.array(RESPONDER_APP_STATUS),
  desktop_available: z.boolean(),
});

export type AssistantStatus = z.infer<typeof ASSISTANT_STATUS>;

export const ASSISTANT_STATUS_NOTICE = z.strictObject({
  type: z.literal('assistant_status'),
  status: ASSISTANT_STATUS,
});

export type AssistantStatusNotice = z.infer<typeof ASSISTANT_STATUS_NOTICE>;

export const ASSISTANT_MODEL_INFO = z.strictObject({
  id: z.string().max(200),
  name: z.string().min(1).max(200),
  efforts: z.array(ASSISTANT_EFFORT),
});

export type AssistantModelInfo = z.infer<typeof ASSISTANT_MODEL_INFO>;

export const ASSISTANT_MODELS = z.strictObject({
  mode: RESPONDER_MODE,
  source: z.string().max(200),
  note: z.string().max(400),
  observed_at: MOMENT,
  default_model: ASSISTANT_MODEL_INFO,
  models: z.array(ASSISTANT_MODEL_INFO),
  live_switch: z.boolean(),
});

export type AssistantModels = z.infer<typeof ASSISTANT_MODELS>;

export const ASSISTANT_USAGE_WINDOW = z.strictObject({
  label: z.string().min(1).max(80),
  used_percent: z.number().min(0).max(1000),
  resets_at: MOMENT.nullable(),
});

export const ASSISTANT_USAGE = z.strictObject({
  mode: RESPONDER_MODE,
  windows: z.array(ASSISTANT_USAGE_WINDOW),
  note: z.string().max(400).nullable(),
});

export type AssistantUsage = z.infer<typeof ASSISTANT_USAGE>;

export const ASSISTANT_REPLY_PUSH_DATA = z.strictObject({
  kind: z.literal('assistant_reply'),
  messageId: ID,
});

export type AssistantReplyPushData = z.infer<typeof ASSISTANT_REPLY_PUSH_DATA>;

export function assistantLabel(settings: Pick<AssistantSettings, 'name'>): string {
  return settings.name ?? 'Coordinator';
}
