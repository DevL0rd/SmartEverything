import { z } from 'zod';
import { BEARER_PROTOCOL_PREFIX, CLIENT_TOKEN } from './api/access';

const ID = z.uuid();

export const ASSISTANT_VOICE_PROTOCOL = 'smarteverything.assistant.v1';

export const ASSISTANT_VOICE_PATH = '/assistant';

export const ASSISTANT_VOICE_HEARTBEAT_MS = 15_000;

export const VOICE_RESULT_TIMINGS = ['pause', 'immediately'] as const;

export const ASSISTANT_VOICE_SETTINGS = z.strictObject({
  model: z.string().trim().min(1).max(120).default('gemini-3.8-live'),
  voice: z.string().trim().min(1).max(60).default('Sadachibia'),
  result_timing: z.enum(VOICE_RESULT_TIMINGS).default('pause'),
  idle_seconds: z.int().min(5).max(600).default(5),
  live_video: z.boolean().default(false),
  context_minutes: z.int().min(0).max(120).optional(),
  memory_lines: z.int().min(0).max(200).optional(),
});

export type AssistantVoiceSettings = z.output<typeof ASSISTANT_VOICE_SETTINGS>;

export const CALL_SOURCES = ['chat', 'orb', 'palette', 'assist', 'assistant', 'shortcut'] as const;

export const CALL_SOURCE = z.enum(CALL_SOURCES);

export type CallSource = z.infer<typeof CALL_SOURCE>;

export const CALL_STATES = ['connecting', 'listening', 'thinking', 'speaking'] as const;

export type CallState = (typeof CALL_STATES)[number];

export const CALL_ENDINGS = [
  'hung_up',
  'finished',
  'idle',
  'failed',
  'replaced',
  'disconnected',
] as const;

export type CallEnding = (typeof CALL_ENDINGS)[number];

export const ASSISTANT_VOICE_CLIENT_MESSAGE = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('call_start'),
    callId: ID,
    source: CALL_SOURCE,
    device: z.string().trim().min(1).max(80),
    chatId: z.uuid().optional(),
    answering: z.uuid().optional(),
    gated: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal('call_end'), callId: ID }),
  z.strictObject({ type: z.literal('mute'), callId: ID, muted: z.boolean() }),
  z.strictObject({ type: z.literal('activity'), callId: ID, speaking: z.boolean() }),
]);

export type AssistantVoiceClientMessage = z.infer<typeof ASSISTANT_VOICE_CLIENT_MESSAGE>;

export const CAPTION_SPEAKERS = ['person', 'assistant', 'tool'] as const;

export const CALL_TURN = z.strictObject({
  who: z.enum(CAPTION_SPEAKERS),
  text: z.string().min(1).max(2000),
  ok: z.boolean(),
  detail: z.string().max(400).nullable(),
});

export type CallTurn = z.infer<typeof CALL_TURN>;

export const CALL_TRANSCRIPT_EMBED = z.strictObject({
  kind: z.literal('call_transcript'),
  turns: z.array(CALL_TURN).max(400),
});

export type CallTranscript = z.infer<typeof CALL_TRANSCRIPT_EMBED>;

export const ASSISTANT_VOICE_SERVER_MESSAGE = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('ready'),
    clientId: ID,
    available: z.boolean(),
    reason: z.string().max(200).nullable(),
  }),
  z.strictObject({
    type: z.literal('call_state'),
    callId: ID,
    state: z.enum(CALL_STATES),
    chatId: ID.optional(),
  }),
  z.strictObject({
    type: z.literal('caption'),
    callId: ID,
    who: z.enum(CAPTION_SPEAKERS),
    text: z.string().max(2000),
  }),
  z.strictObject({ type: z.literal('interrupted'), callId: ID }),
  z.strictObject({
    type: z.literal('ended'),
    callId: ID,
    reason: z.enum(CALL_ENDINGS),
    detail: z.string().max(200).nullable(),
  }),
]);

export type AssistantVoiceServerMessage = z.infer<typeof ASSISTANT_VOICE_SERVER_MESSAGE>;

export function assistantVoiceProtocols(token: string): readonly [string, string] {
  return [ASSISTANT_VOICE_PROTOCOL, `${BEARER_PROTOCOL_PREFIX}${CLIENT_TOKEN.parse(token)}`];
}
