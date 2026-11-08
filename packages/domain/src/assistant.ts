import { ASSISTANT_REACTION } from './assistant-reactions';
import { AI_MODEL_ID, MEMORY_MODEL_DEFAULT } from './ai-models';
import { AI_MESSAGE_REFERENCES } from './ai-references';
import { AI_AGENT_LOOP_SETTINGS } from './ai-goals';
import { z } from 'zod';
export * from './assistant-response-style';
import { AI_MESSAGE_FIELDS, CHAT_STEP_OUTCOMES } from './ai-chats';
import { ASSISTANT_VOICE_CHANGE, ASSISTANT_VOICE_SETTINGS } from './assistant-voice';
import { IMAGE_DEFAULTS } from './image-defaults';
import { plainTextOf } from './markdown';
import {
  ASSISTANT_RESPONSE_STYLE,
  ASSISTANT_RESPONSE_STYLE_CHANGE,
  ASSISTANT_RESPONSE_STYLE_WRITE,
} from './assistant-response-style';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const ASSISTANT_STEP_MAX = 200;
export const ASSISTANT_STEPS_KEPT = 40;
export const ASSISTANT_ATTACHMENT_BYTES_MAX = 25 * 1024 * 1024;
export const ASSISTANT_UPLOAD_CHUNK_BYTES = 512 * 1024;
export const ASSISTANT_LEVEL_WINDOW_MS = 50;
export const ASSISTANT_LEVEL_MAX = 255;
export const ASSISTANT_MESSAGES_SNAPSHOT = 60;
export const ASSISTANT_NAME_MAX = 40;
export const ASSISTANT_INSTRUCTIONS_MAX = 8000;

export const ASSISTANT_NAME = z.string().trim().min(1).max(ASSISTANT_NAME_MAX);

export const COMPACT_AT_PERCENT = { min: 50, max: 95, step: 5, fallback: 85 } as const;

export const IMAGE_MODEL_CHOICE = z.strictObject({
  model: z.string().min(1).max(200),
  provider_tag: z.string().min(1).max(200),
});
export type ImageModelChoice = z.infer<typeof IMAGE_MODEL_CHOICE>;

export const IMAGE_MODEL_SETTING = IMAGE_MODEL_CHOICE.nullable().describe(
  'The image model and provider the person picked for making and editing images; null lets the AI choose from the available image endpoints. It must accept reference images before the AI uses it to edit',
);

export const AGENT_LOOPS_SETTING = AI_AGENT_LOOP_SETTINGS.describe(
  'Caps for the automatic work of the AI: goal rounds, ralph loops, workflows and the code they run; each unset value uses the harness default',
);

export const MEMORY_MODEL_SETTING = AI_MODEL_ID.describe(
  'The OpenRouter model slug the memory manager uses after each turn to add, update and clean up memories; sent as written, the default is ~deepseek/deepseek-flash-latest',
);

const SETTINGS_SHAPE = {
  image_model: IMAGE_MODEL_SETTING,
  memory_model: MEMORY_MODEL_SETTING,
  image_defaults: IMAGE_DEFAULTS.describe(
    'Default options for each image model, keyed model|provider; used when the AI leaves an option out',
  ),
  instructions: z.string().max(ASSISTANT_INSTRUCTIONS_MAX),
  activity_steps: z.boolean(),
  name: ASSISTANT_NAME.nullable(),
  aliases: z.array(ASSISTANT_NAME).max(10),
  voice: ASSISTANT_VOICE_CHANGE,
  compact_at_percent: z.int().min(COMPACT_AT_PERCENT.min).max(COMPACT_AT_PERCENT.max),
  describe_images: z
    .boolean()
    .describe(
      'For models that can already see images, also store a short background description to carry in later turns; models that cannot see images always get one. Off leaves only the image details and the chat_read view attachment hint',
    ),
  reply_cost: z.boolean().describe('Show what each reply cost under it in the chat'),
  reply_suggestions: z
    .boolean()
    .describe(
      'After a reply in an app chat, ask a cheap model for up to three short follow-up replies to offer as taps; costs a little per reply',
    ),
  agent_loops: AGENT_LOOPS_SETTING,
  claude_link_auto: z
    .boolean()
    .describe(
      'When the hub starts and Claude Desktop is on this computer, install or repair the SmartEverything link in it automatically; false leaves the link as it is',
    ),
};

const SETTINGS_FIELDS = {
  response_style: ASSISTANT_RESPONSE_STYLE.optional(),
  instructions: SETTINGS_SHAPE.instructions.default(''),
  activity_steps: SETTINGS_SHAPE.activity_steps.default(true),
  name: SETTINGS_SHAPE.name.default('Coordinator'),
  aliases: SETTINGS_SHAPE.aliases.default([]),
  voice: ASSISTANT_VOICE_SETTINGS.prefault({}),
  compact_at_percent: SETTINGS_SHAPE.compact_at_percent.default(COMPACT_AT_PERCENT.fallback),
  describe_images: SETTINGS_SHAPE.describe_images.default(false),
  image_model: SETTINGS_SHAPE.image_model.default(null),
  memory_model: SETTINGS_SHAPE.memory_model.default(MEMORY_MODEL_DEFAULT),
  image_defaults: SETTINGS_SHAPE.image_defaults.default({}),
  reply_cost: SETTINGS_SHAPE.reply_cost.default(true),
  reply_suggestions: SETTINGS_SHAPE.reply_suggestions.default(false),
  claude_link_auto: SETTINGS_SHAPE.claude_link_auto.default(true),
  agent_loops: SETTINGS_SHAPE.agent_loops.prefault({}),
};

export const ASSISTANT_SETTINGS = z.object(SETTINGS_FIELDS);
export const ASSISTANT_SETTINGS_WRITE = z.strictObject({
  ...SETTINGS_FIELDS,
  response_style: ASSISTANT_RESPONSE_STYLE_WRITE.optional(),
});

export type AssistantSettings = z.output<typeof ASSISTANT_SETTINGS>;

export const ASSISTANT_SETTINGS_CHANGE = z
  .strictObject({
    ...SETTINGS_SHAPE,
    response_style: ASSISTANT_RESPONSE_STYLE_CHANGE,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'name at least one field to change',
  });

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

export const ASSISTANT_CONTINUE_NOTE = 'Continue the work you were doing.';

export function isInterruption(code: AssistantReasonCode | null): boolean {
  return code === 'interrupted' || code === 'stopped';
}

export const ASSISTANT_LEVELS = z
  .array(z.int().min(0).max(ASSISTANT_LEVEL_MAX))
  .max(ASSISTANT_ATTACHMENT_BYTES_MAX)
  .describe(
    'Loudness of an audio clip, one value from 0 to 255 for each 50 ms of its length, the peak of that window',
  );

export const ASSISTANT_ATTACHMENT = z.strictObject({
  id: ID,
  name: z.string().min(1).max(200),
  mime: z.string().min(3).max(120),
  bytes: z.int().min(1).max(ASSISTANT_ATTACHMENT_BYTES_MAX),
  width: z.int().min(1).nullable(),
  height: z.int().min(1).nullable(),
  transcript: z.string().nullable().optional(),
  levels: ASSISTANT_LEVELS.nullable().optional(),
});

export type AssistantAttachment = z.infer<typeof ASSISTANT_ATTACHMENT>;

export const HELPER_DIALOGUE_KIND = 'helper_dialogue';
export const HELPER_INPUT_KIND = 'helper_input';

export const HELPER_DIALOGUE = z.strictObject({
  kind: z.literal(HELPER_DIALOGUE_KIND),
  direction: z.enum(['to_helper', 'from_helper']),
  helper_chat_id: ID,
  helper_name: z.string().min(1).max(120),
});

export type HelperDialogue = z.infer<typeof HELPER_DIALOGUE>;

export const MESSAGE_QUOTE_MEDIA_KINDS = ['image', 'file', 'voice'] as const;

export type MessageQuoteMediaKind = (typeof MESSAGE_QUOTE_MEDIA_KINDS)[number];

export const MESSAGE_QUOTE = z.strictObject({
  message_id: ID,
  author: z.string().min(1).max(120),
  excerpt: z.string(),
  media_kind: z.enum(MESSAGE_QUOTE_MEDIA_KINDS).nullable(),
});

export type MessageQuote = z.infer<typeof MESSAGE_QUOTE>;

export const ASSISTANT_MESSAGE_ROW = z.strictObject({
  id: ID,
  profile_id: ID,
  client_id: ID.nullable(),
  role: z.enum(ASSISTANT_MESSAGE_ROLES),
  kind: z.enum(ASSISTANT_MESSAGE_KINDS),
  author: z.string().min(1).max(120),
  text: z.string(),
  attachments: z.array(ASSISTANT_ATTACHMENT),
  references: AI_MESSAGE_REFERENCES.default([]).optional(),
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
  quote: MESSAGE_QUOTE.nullable().describe(
    'The message this one replies to, copied when it was written so it reads the same wherever it shows; null when it quotes nothing',
  ),
  ...AI_MESSAGE_FIELDS,
  reactions: z.array(ASSISTANT_REACTION).optional(),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type AssistantMessageRow = z.infer<typeof ASSISTANT_MESSAGE_ROW>;

function quoteMediaKindOf(
  attachments: readonly Pick<AssistantAttachment, 'mime'>[],
): MessageQuoteMediaKind | null {
  const first = attachments[0];
  if (first === undefined) return null;
  if (first.mime.startsWith('image/')) return 'image';
  return first.mime.startsWith('audio/') ? 'voice' : 'file';
}

export interface QuotableMessage {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly attachments: readonly Pick<AssistantAttachment, 'mime' | 'transcript'>[];
}

export function messageQuoteOf(row: QuotableMessage): MessageQuote {
  const transcript =
    row.attachments.map((item) => item.transcript ?? '').find((text) => text !== '') ?? '';
  const source = row.text.trim() === '' ? transcript : row.text;
  return {
    message_id: row.id,
    author: row.author,
    excerpt: plainTextOf(source),
    media_kind: quoteMediaKindOf(row.attachments),
  };
}

export function helperDialogueOf(
  row: Pick<AssistantMessageRow, 'embeds'>,
): HelperDialogue | undefined {
  const embed = row.embeds.find(({ kind }) => kind === HELPER_DIALOGUE_KIND);
  return embed === undefined ? undefined : HELPER_DIALOGUE.parse(embed);
}

export function isHelperDialogueMessage(row: Pick<AssistantMessageRow, 'embeds'>): boolean {
  return row.embeds.some(({ kind }) => kind === HELPER_DIALOGUE_KIND || kind === HELPER_INPUT_KIND);
}

const RETIRED_FAILED_ACTION_PREFIX = 'Couldn’t do this: ';

export function isRetiredFailedAction(row: Pick<AssistantMessageRow, 'kind' | 'text'>): boolean {
  return row.kind === 'action' && row.text.startsWith(RETIRED_FAILED_ACTION_PREFIX);
}

export const ASSISTANT_STATUS = z.object({
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
