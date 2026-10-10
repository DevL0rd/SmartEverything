import { z } from 'zod';
import { PLUGIN_REQUESTERS } from './plugin-people';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const ENGINE_KINDS = ['openrouter'] as const;

export type EngineKind = (typeof ENGINE_KINDS)[number];

export const ENGINE_KIND = z.enum(ENGINE_KINDS);

export const ENGINE = z.strictObject({
  kind: ENGINE_KIND,
  model: z.string().trim().min(1).max(200).nullable().default(null),
  effort: z.string().trim().min(1).max(32).nullable().default(null),
});

export type Engine = z.output<typeof ENGINE>;

export const ENGINE_REQUEST = ENGINE.extend({
  worker_id: z.string().nullable().optional(),
}).transform(({ kind, model, effort }): Engine => ({ kind, model, effort }));

export const DEFAULT_ENGINE: Engine = {
  kind: 'openrouter',
  model: null,
  effort: null,
};

export const AI_CHAT_KINDS = ['chat', 'subagent', 'plugin', 'call'] as const;

export type AiChatKind = (typeof AI_CHAT_KINDS)[number];

export const AI_CHAT_TITLE_MAX = 80;

export const NEW_CHAT_TITLE = 'New chat';

export const EARLIER_CHAT_TITLE = 'Earlier chat';

export const MESSAGE_SOURCES = [
  'app',
  'voice',
  'plugin',
  'wake',
  'subagent',
  'schedule',
  'chat',
] as const;

export type MessageSource = (typeof MESSAGE_SOURCES)[number];

export const AI_HOPS_MAX = 8;

export const MESSAGE_ORIGIN = z.strictObject({
  source: z.enum(MESSAGE_SOURCES),
  plugin_id: z.string().min(1).max(80).nullable().default(null),
  device_id: ID.nullable().default(null),
  name: z.string().min(1).max(120).nullable().default(null),
  hops: z.int().min(0).max(AI_HOPS_MAX).optional(),
  requester: z.enum(PLUGIN_REQUESTERS).optional(),
});

export type MessageOrigin = z.output<typeof MESSAGE_ORIGIN>;

export const AI_CHAT_ROW = z.strictObject({
  id: ID,
  profile_id: ID,
  kind: z.enum(AI_CHAT_KINDS),
  title: z.string().min(1).max(AI_CHAT_TITLE_MAX),
  icon: z.string().min(1).max(40).nullable(),
  parent_id: ID.nullable(),
  source_key: z.string().min(1).max(300).nullable(),
  engine: ENGINE,
  tools: z.array(z.string().min(1).max(200)).nullable(),
  web_search: z
    .boolean()
    .nullable()
    .default(null)
    .describe('Whether the AI may search the web in this chat; null follows web_search_default'),
  pinned: z.boolean(),
  archived_at: MOMENT.nullable(),
  cost_micros: z.int().min(0),
  origin: MESSAGE_ORIGIN.nullable()
    .default(null)
    .describe('How the chat began: the origin of its first message; null while it has none'),
  read_at: MOMENT.nullable()
    .default(null)
    .describe('When the person last read the chat, on any device; null when never'),
  unread_count: z
    .int()
    .min(0)
    .default(0)
    .describe('Messages that arrived after read_at and were not written by the person in the app'),
  context_percent: z
    .int()
    .min(0)
    .max(100)
    .nullable()
    .default(null)
    .describe('How full the chat’s context window is after its latest turn; null when unknown'),
  branch_message_id: ID.nullable()
    .default(null)
    .describe('The message of the parent chat this chat was branched from; null when not a branch'),
  last_message_at: MOMENT.nullable(),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type AiChatRow = z.infer<typeof AI_CHAT_ROW>;

export const WEB_SOURCES_KIND = 'web_sources';

export const WEB_SOURCES_MAX = 20;

export const WEB_SOURCE = z.strictObject({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  title: z.string().max(300),
});

export type WebSource = z.infer<typeof WEB_SOURCE>;

export const WEB_SOURCES_EMBED = z.strictObject({
  kind: z.literal(WEB_SOURCES_KIND),
  sources: z.array(WEB_SOURCE).min(1).max(WEB_SOURCES_MAX),
});

export type WebSourcesEmbed = z.infer<typeof WEB_SOURCES_EMBED>;

export function chatSearchesWeb(chat: Pick<AiChatRow, 'web_search'>, byDefault: boolean): boolean {
  return chat.web_search ?? byDefault;
}

export const MESSAGE_EMBED = z.looseObject({ kind: z.string().min(1).max(40) });

export const COMPACTION_EMBED = z.strictObject({
  kind: z.literal('compaction'),
  through_at: MOMENT,
});

export type CompactionEmbed = z.infer<typeof COMPACTION_EMBED>;

export const TOOLS_CHANGED_EMBED = z.strictObject({
  kind: z.literal('tools_changed'),
  added: z.array(z.string().min(1).max(200)).max(500),
  removed: z.array(z.string().min(1).max(200)).max(500),
});

export type ToolsChangedEmbed = z.infer<typeof TOOLS_CHANGED_EMBED>;

export const REPLY_SUGGESTIONS_MAX = 3;

export const REPLY_SUGGESTION_TEXT_MAX = 80;

export const REPLY_SUGGESTIONS_KIND = 'reply_suggestions';

export const REPLY_SUGGESTIONS_EMBED = z.strictObject({
  kind: z.literal(REPLY_SUGGESTIONS_KIND),
  suggestions: z
    .array(z.string().trim().min(1).max(REPLY_SUGGESTION_TEXT_MAX))
    .min(1)
    .max(REPLY_SUGGESTIONS_MAX),
});

export type ReplySuggestionsEmbed = z.infer<typeof REPLY_SUGGESTIONS_EMBED>;

export interface ChatMessageKind {
  readonly role: string;
  readonly kind: string;
}

export function isChatActivity(message: ChatMessageKind): boolean {
  return message.role !== 'system' || message.kind === 'call';
}

export function chatActivitySql(table: string): string {
  return `(${table}.role <> 'system' or ${table}.kind = 'call')`;
}

export const CHAT_ACTIVITY_SQL = chatActivitySql('assistant_messages');

export const AI_MESSAGE_FIELDS = {
  chat_id: ID,
  origin: MESSAGE_ORIGIN.nullable(),
  embeds: z.array(MESSAGE_EMBED).max(20),
  cost_micros: z.int().min(0),
  model: z.string().max(200).nullable(),
};

export const CHAT_ACTIVITY_STATES = ['idle', 'thinking', 'tool', 'replying', 'failed'] as const;

export type ChatActivityState = (typeof CHAT_ACTIVITY_STATES)[number];

export const CHAT_TOOL_STATES = ['running', 'done', 'failed'] as const;

export const CHAT_TOOL_ITEM = z.strictObject({
  callId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  state: z.enum(CHAT_TOOL_STATES),
  detail: z.string().max(400).nullable(),
});

export type ChatToolItem = z.infer<typeof CHAT_TOOL_ITEM>;

export const CHAT_STEP_OUTCOMES = ['done', 'failed', 'retried'] as const;

export type ChatStepOutcome = (typeof CHAT_STEP_OUTCOMES)[number];

export const CHAT_STREAM_PART = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), delta: z.string().max(16_000) }),
  z.strictObject({ kind: z.literal('reasoning'), delta: z.string().max(16_000) }),
  CHAT_TOOL_ITEM.extend({ kind: z.literal('tool') }),
]);

export type ChatStreamPart = z.infer<typeof CHAT_STREAM_PART>;

export const CHAT_ACTIVITY_NOTICE = z.strictObject({
  type: z.literal('chat_activity'),
  chatId: ID,
  turnId: ID,
  messageId: ID.nullable(),
  seq: z.int().min(0),
  state: z.enum(CHAT_ACTIVITY_STATES),
  steps: z.array(z.string().min(1).max(200)).max(40),
  draft: z.string().max(64_000),
  reasoning: z.string().max(64_000),
  tools: z.array(CHAT_TOOL_ITEM).max(64),
  finish: z.string().max(40).nullable(),
  reason: z.string().max(400).nullable(),
});

export type ChatActivityNotice = z.infer<typeof CHAT_ACTIVITY_NOTICE>;

export const CHAT_STREAM_NOTICE = z.strictObject({
  type: z.literal('chat_stream'),
  chatId: ID,
  turnId: ID,
  seq: z.int().min(1),
  parts: z.array(CHAT_STREAM_PART).min(1).max(64),
});

export type ChatStreamNotice = z.infer<typeof CHAT_STREAM_NOTICE>;

export const AI_CHAT_NEW = z.strictObject({
  title: z.string().trim().min(1).max(AI_CHAT_TITLE_MAX).optional(),
  icon: z.string().trim().min(1).max(40).optional(),
  engine: ENGINE_REQUEST.optional(),
  parent_id: ID.optional(),
});

export type AiChatNew = z.output<typeof AI_CHAT_NEW>;

export const AI_CHAT_CHANGE = z
  .strictObject({
    title: z.string().trim().min(1).max(AI_CHAT_TITLE_MAX),
    icon: z.string().trim().min(1).max(40).nullable(),
    pinned: z.boolean(),
    archived: z.boolean(),
    read: z
      .boolean()
      .describe(
        'true marks the chat read now on every device; false marks its latest incoming message unread',
      ),
    engine: ENGINE_REQUEST,
    tools: z.array(z.string().min(1).max(200)).max(500).nullable(),
    web_search: z
      .boolean()
      .describe(
        'true lets the AI search the web in this chat, false stops it; the AI itself may set this for its own chat',
      ),
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, {
    message: 'name at least one field to change',
  });

export type AiChatChange = z.output<typeof AI_CHAT_CHANGE>;

export const AI_CHAT_BRANCH = z.strictObject({
  messageId: ID.describe(
    'The message to branch from; the new chat holds the chat up to and including it',
  ),
  title: z.string().trim().min(1).max(AI_CHAT_TITLE_MAX).optional(),
});

export type AiChatBranch = z.output<typeof AI_CHAT_BRANCH>;

export const AI_CHAT_HIT = z.strictObject({
  chatId: ID,
  title: z.string().min(1).max(AI_CHAT_TITLE_MAX),
  messageId: ID.nullable().describe('The matching message; null when the chat’s title matched'),
  snippet: z.string().max(400),
  at: MOMENT,
  archived: z.boolean(),
});

export type AiChatHit = z.infer<typeof AI_CHAT_HIT>;

export const AI_ASK_TEXT_MAX = 16_000;

export const AI_ASK = z.strictObject({
  text: z.string().trim().min(1).max(AI_ASK_TEXT_MAX),
  wait: z.boolean().default(false),
  timeoutSeconds: z.int().min(5).max(120).default(60),
});

export type AiAsk = z.output<typeof AI_ASK>;

export const AI_SUBAGENT = z.strictObject({
  task: z.string().trim().min(1).max(AI_ASK_TEXT_MAX),
  title: z.string().trim().min(1).max(AI_CHAT_TITLE_MAX).optional(),
  engine: ENGINE.optional(),
  tools: z.array(z.string().min(1).max(200)).min(1).max(200).optional(),
  wait: z.boolean().default(true),
  timeoutSeconds: z.int().min(5).max(300).default(120),
});

export type AiSubagent = z.output<typeof AI_SUBAGENT>;

export const AI_ASK_STATES = ['queued', 'working', 'answered', 'failed'] as const;

export const AI_ASK_RESULT = z.strictObject({
  chatId: ID,
  eventId: ID,
  state: z.enum(AI_ASK_STATES),
  text: z.string().nullable(),
});

export type AiAskResult = z.infer<typeof AI_ASK_RESULT>;
