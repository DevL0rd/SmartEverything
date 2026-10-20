import { z } from 'zod';
import { JSON_VALUE } from './values';

const MOMENT = z.iso.datetime({ offset: true });

export const CLAUDE_SESSION_ID = z.string().min(1).max(200);

export const CLAUDE_PROMPT_ID = z.string().min(1).max(200);

export const CLAUDE_TEXT_LIMIT = 20_000;

export const CLAUDE_LIVE_STATES = ['idle', 'busy', 'waiting', 'shell', 'unknown'] as const;

export const CLAUDE_LIVE_STATE = z.enum(CLAUDE_LIVE_STATES);

export const CLAUDE_SESSION_STATE = z.enum([...CLAUDE_LIVE_STATES, 'stopped']);

export type ClaudeSessionState = z.infer<typeof CLAUDE_SESSION_STATE>;

export const CLAUDE_SETTABLE_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'bypassPermissions',
  'dontAsk',
] as const;

export const CLAUDE_SETTABLE_MODE = z.enum(CLAUDE_SETTABLE_MODES);

export const CLAUDE_PERMISSION_MODE = z.enum([...CLAUDE_SETTABLE_MODES, 'unknown']);

export type ClaudePermissionMode = z.infer<typeof CLAUDE_PERMISSION_MODE>;

export const CLAUDE_CAPABILITY_KEYS = [
  'send',
  'interrupt',
  'answer_prompts',
  'set_mode',
  'set_model',
  'usage',
] as const;

export type ClaudeCapabilityKey = (typeof CLAUDE_CAPABILITY_KEYS)[number];

const MISSING_REASON = z.string().min(1).max(300).nullable();

export const CLAUDE_CAPABILITIES = z.strictObject({
  send: MISSING_REASON,
  interrupt: MISSING_REASON,
  answer_prompts: MISSING_REASON,
  set_mode: MISSING_REASON,
  set_model: MISSING_REASON,
  usage: MISSING_REASON,
});

export type ClaudeCapabilities = z.infer<typeof CLAUDE_CAPABILITIES>;

export const CLAUDE_SESSION_LIST_MAX = 5000;

export const CLAUDE_SESSION = z.strictObject({
  id: CLAUDE_SESSION_ID,
  desktop_id: z.string().min(1).max(200).nullable(),
  title: z.string().max(500).nullable(),
  cwd: z.string().max(4096).nullable(),
  state: CLAUDE_SESSION_STATE,
  last_state: CLAUDE_LIVE_STATE.nullable(),
  archived: z.boolean(),
  model: z.string().max(200).nullable(),
  permission_mode: CLAUDE_PERMISSION_MODE,
  entrypoint: z.string().max(100).nullable(),
  pid: z.int().positive().nullable(),
  started_at: MOMENT.nullable(),
  updated_at: MOMENT.nullable(),
  waiting_prompts: z.int().min(0),
  context_used: z.int().min(0).nullable(),
  capabilities: CLAUDE_CAPABILITIES,
});

export type ClaudeSession = z.infer<typeof CLAUDE_SESSION>;

export const CLAUDE_LISTED_SESSION = CLAUDE_SESSION.extend({
  app_chat_id: z.uuid().nullable(),
});

export type ClaudeListedSession = z.infer<typeof CLAUDE_LISTED_SESSION>;

const THREAD_BASE = {
  id: z.string().regex(/^\d+\.\d+$/),
  at: MOMENT.nullable(),
  sidechain: z.boolean(),
  meta: z.boolean(),
  truncated: z.boolean(),
};

const THREAD_TEXT = z.string().max(CLAUDE_TEXT_LIMIT);

export const CLAUDE_THREAD_ITEM = z.discriminatedUnion('kind', [
  z.strictObject({ ...THREAD_BASE, kind: z.literal('user'), text: THREAD_TEXT }),
  z.strictObject({ ...THREAD_BASE, kind: z.literal('assistant'), text: THREAD_TEXT }),
  z.strictObject({ ...THREAD_BASE, kind: z.literal('thinking'), text: THREAD_TEXT }),
  z.strictObject({
    ...THREAD_BASE,
    kind: z.literal('tool_use'),
    tool_use_id: z.string().max(200),
    tool_name: z.string().max(200),
    input: THREAD_TEXT,
  }),
  z.strictObject({
    ...THREAD_BASE,
    kind: z.literal('tool_result'),
    tool_use_id: z.string().max(200),
    text: THREAD_TEXT,
    is_error: z.boolean(),
  }),
  z.strictObject({
    ...THREAD_BASE,
    kind: z.literal('system'),
    subtype: z.string().max(100).nullable(),
    text: THREAD_TEXT,
  }),
  z.strictObject({ ...THREAD_BASE, kind: z.literal('other'), block: z.string().max(100) }),
]);

export type ClaudeThreadItem = z.infer<typeof CLAUDE_THREAD_ITEM>;

export const CLAUDE_THREAD_CURSOR = z.string().regex(/^\d+$/);

export const CLAUDE_THREAD_LIMIT = 200;

export const CLAUDE_THREAD_PAGE = z.strictObject({
  items: z.array(CLAUDE_THREAD_ITEM).max(CLAUDE_THREAD_LIMIT * 8),
  older: CLAUDE_THREAD_CURSOR.nullable(),
  skipped: z.int().min(0),
});

export type ClaudeThreadPage = z.infer<typeof CLAUDE_THREAD_PAGE>;

export const CLAUDE_PLAN_WINDOWS = ['five_hour', 'seven_day', 'unknown'] as const;

export const CLAUDE_USAGE = z.strictObject({
  sampled_at: MOMENT.nullable(),
  windows: z.array(
    z.strictObject({
      key: z.string().min(1).max(100),
      window: z.enum(CLAUDE_PLAN_WINDOWS),
      used_percent: z.number().min(0).max(1000),
    }),
  ),
});

export type ClaudeUsage = z.infer<typeof CLAUDE_USAGE>;

export const CLAUDE_DESKTOP_STATES = [
  'running',
  'not_running',
  'not_found',
  'unsupported_platform',
] as const;

export const CLAUDE_LINK_STATES = ['not_installed', 'installed', 'needs_repair'] as const;

export const CLAUDE_CONTROLLER_STATES = ['not_registered', 'ready', 'busy', 'lost'] as const;

export const CLAUDE_SOURCES = [
  'live_session',
  'desktop_index',
  'transcript',
  'plan_usage',
] as const;

export const CLAUDE_STATUS = z.strictObject({
  desktop: z.strictObject({
    state: z.enum(CLAUDE_DESKTOP_STATES),
    cli_version: z.string().max(100).nullable(),
  }),
  link: z.strictObject({
    state: z.enum(CLAUDE_LINK_STATES),
    problem: z
      .string()
      .max(400)
      .nullable()
      .default(null)
      .describe('Why the last automatic install or repair of the link failed, if it did'),
  }),
  controller: z.strictObject({ state: z.enum(CLAUDE_CONTROLLER_STATES) }),
  sessions: z.strictObject({ live: z.int().min(0), total: z.int().min(0) }),
  usage: CLAUDE_USAGE,
  diagnostics: z
    .array(
      z.strictObject({
        source: z.enum(CLAUDE_SOURCES),
        name: z.string().max(300),
        problem: z.string().max(400),
      }),
    )
    .max(50),
});

export type ClaudeStatus = z.infer<typeof CLAUDE_STATUS>;

export const CLAUDE_PROMPT_KINDS = ['permission', 'question', 'plan'] as const;

export const CLAUDE_QUESTION = z.strictObject({
  question: z.string().max(2000),
  header: z.string().max(200).nullable(),
  multi_select: z.boolean(),
  options: z.array(
    z.strictObject({ label: z.string().max(500), description: z.string().max(2000).nullable() }),
  ),
});

export const CLAUDE_PROMPT = z.strictObject({
  id: CLAUDE_PROMPT_ID,
  session_id: CLAUDE_SESSION_ID,
  kind: z.enum(CLAUDE_PROMPT_KINDS),
  tool_name: z.string().max(200),
  input: JSON_VALUE,
  questions: z.array(CLAUDE_QUESTION),
  risk: z.enum(['safe', 'risky']),
  risk_reasons: z.array(z.string().max(300)),
  state: z.enum(['waiting', 'allowed', 'denied', 'answered', 'expired', 'taken_over']),
  answered_by: z.enum(['owner', 'ai', 'desktop']).nullable(),
  created_at: MOMENT,
  expires_at: MOMENT,
});

export type ClaudePrompt = z.infer<typeof CLAUDE_PROMPT>;

export const CLAUDE_CONTROL = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('send'),
    text: z.string().trim().min(1).max(20_000),
  }),
  z.strictObject({ action: z.literal('interrupt') }),
  z.strictObject({
    action: z.literal('set_mode'),
    permission_mode: CLAUDE_SETTABLE_MODE,
  }),
  z.strictObject({ action: z.literal('set_model'), model: z.string().trim().min(1).max(200) }),
]);

export type ClaudeControl = z.output<typeof CLAUDE_CONTROL>;

export const CLAUDE_DELIVERIES = ['confirmed', 'queued_unverified'] as const;

export type ClaudeDelivery = (typeof CLAUDE_DELIVERIES)[number];

export const CLAUDE_CONTROLLED = CLAUDE_SESSION.extend({
  delivery: z
    .enum(CLAUDE_DELIVERIES)
    .optional()
    .describe(
      'For a sent prompt: confirmed once it showed in the transcript, queued_unverified when the session was busy and has not shown it yet',
    ),
});

export type ClaudeControlled = z.infer<typeof CLAUDE_CONTROLLED>;

export const CLAUDE_ANSWER = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('allow') }),
  z.strictObject({ decision: z.literal('deny'), reason: z.string().trim().max(500).optional() }),
  z.strictObject({
    decision: z.literal('answer'),
    answers: z
      .array(
        z.strictObject({
          question: z.string().min(1).max(2000),
          choices: z.array(z.string().min(1).max(500)).min(1),
        }),
      )
      .min(1),
  }),
]);

export type ClaudeAnswer = z.output<typeof CLAUDE_ANSWER>;

export const CLAUDE_LINK = z.strictObject({ state: z.enum(CLAUDE_LINK_STATES) });

export type ClaudeLink = z.infer<typeof CLAUDE_LINK>;

export const CLAUDE_CONTROLLER_REGISTRATION = z.strictObject({
  folder: z.string().min(1).max(4096),
  prompt: z.string().min(1).max(2000),
  deep_link: z.string().min(1).max(8000),
  expires_at: MOMENT,
});

export type ClaudeControllerRegistration = z.infer<typeof CLAUDE_CONTROLLER_REGISTRATION>;

export const CLAUDE_CONTROLLER = z.strictObject({ state: z.enum(CLAUDE_CONTROLLER_STATES) });

export type ClaudeController = z.infer<typeof CLAUDE_CONTROLLER>;

export const CLAUDE_START = z.strictObject({
  folder: z.string().trim().min(1).max(4096).describe('An absolute path of an existing folder'),
  text: z.string().trim().min(1).max(CLAUDE_TEXT_LIMIT).describe('The first prompt of the session'),
});

export type ClaudeStart = z.output<typeof CLAUDE_START>;

export const CLAUDE_STARTED = z.strictObject({
  method: z.enum(['controller', 'deep_link']),
  state: z.enum(['started', 'prefilled']),
  detail: z.string().max(500),
});

export type ClaudeStarted = z.infer<typeof CLAUDE_STARTED>;

export const CLAUDE_OPERATION = z.strictObject({
  id: z.uuid(),
  operation: z.enum(['control', 'start', 'native_tools_call']),
  state: z.enum(['pending', 'completed', 'failed', 'uncertain']),
  value: JSON_VALUE,
  error: z.string().max(2000).nullable(),
});
export type ClaudeOperation = z.infer<typeof CLAUDE_OPERATION>;
export const CLAUDE_OPERATION_ACCEPTED = z.strictObject({ native_operation: CLAUDE_OPERATION });

export const CLAUDE_NOTICES = [
  z.strictObject({ type: z.literal('claude_operation'), operation: CLAUDE_OPERATION }),
  z.strictObject({ type: z.literal('claude_session'), session: CLAUDE_SESSION }),
  z.strictObject({ type: z.literal('claude_session_gone'), id: CLAUDE_SESSION_ID }),
  z.strictObject({
    type: z.literal('claude_thread'),
    session_id: CLAUDE_SESSION_ID,
    items: z.array(CLAUDE_THREAD_ITEM).min(1).max(CLAUDE_THREAD_LIMIT),
  }),
  z.strictObject({ type: z.literal('claude_status'), status: CLAUDE_STATUS }),
] as const;

export type ClaudeNotice = z.output<(typeof CLAUDE_NOTICES)[number]>;
