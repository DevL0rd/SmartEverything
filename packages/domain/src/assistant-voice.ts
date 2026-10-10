import { z } from 'zod';
import { CHEAPEST_SPEECH_MODEL, SPEECH_MODELS, SPEECH_VOICE } from './one-shot-speech';
import { BEARER_PROTOCOL_PREFIX, CLIENT_TOKEN } from './api/access';
import {
  APP_SIGHT_SOURCE,
  SIGHT_FACING,
  SIGHT_LABEL_MAX,
  SIGHT_LOOK_TRIGGER,
  SIGHT_MEMORY_SECONDS,
  SIGHT_MODE,
  SIGHT_REFUSAL,
  SIGHT_SOURCE,
  SIGHT_STOP_REASON,
  SIGHT_TARGET_MAX,
} from './call-sight';

export * from './call-sight';

const ID = z.uuid();

export const ASSISTANT_VOICE_PROTOCOL = 'smarteverything.assistant.v1';

export const ASSISTANT_VOICE_PATH = '/assistant';

export const ASSISTANT_VOICE_HEARTBEAT_MS = 15_000;

export const VOICE_KEY_MISSING = 'Add a Gemini key in Settings › Assistant › Voice calls.';

export const VOICE_RESULT_TIMINGS = ['pause', 'immediately'] as const;

export const LIVE_CONTEXT_MINUTES = { min: 1, max: 60, fallback: 4 } as const;

export const ASSISTANT_VOICE_SETTINGS = z.strictObject({
  model: z.string().trim().min(1).max(120).default('gemini-3.8-live'),
  voice: SPEECH_VOICE.default('Sadachbia'),
  speech_model: z
    .enum(SPEECH_MODELS)
    .default(CHEAPEST_SPEECH_MODEL)
    .describe(
      'Which text-to-speech model says one-off lines (announcements, speaking through a device without a conversation). The default is the cheapest',
    ),
  speech_voice: SPEECH_VOICE.nullable()
    .default(null)
    .describe('The voice for one-off lines; unset uses the call voice'),
  result_timing: z.enum(VOICE_RESULT_TIMINGS).default('pause'),
  idle_seconds: z.int().min(5).max(600).default(5),
  live_video: z.boolean().default(false),
  mute_mic_while_speaking: z
    .boolean()
    .default(false)
    .describe(
      'Camera calls: drop the camera microphone audio while the AI speaks and for a moment after. Off keeps the microphone streaming to the model the whole time, relying on the camera’s own echo cancellation',
    ),
  live_context_minutes: z
    .int()
    .min(LIVE_CONTEXT_MINUTES.min)
    .max(LIVE_CONTEXT_MINUTES.max)
    .optional()
    .describe(
      'How many minutes of a voice call stay in the model context; older speech and video are dropped from it (the transcript keeps the text). Unset means the default of 4',
    ),
  context_minutes: z.int().min(0).max(120).optional(),
  memory_lines: z.int().min(0).max(200).optional(),
});

export type AssistantVoiceSettings = z.output<typeof ASSISTANT_VOICE_SETTINGS>;

export const CALL_SOURCES = ['chat', 'orb', 'palette', 'assist', 'assistant', 'shortcut'] as const;

export const CALL_SOURCE = z.enum(CALL_SOURCES);

export type CallSource = z.infer<typeof CALL_SOURCE>;

export const CALL_STATES = ['connecting', 'listening', 'thinking', 'speaking'] as const;

export type CallState = (typeof CALL_STATES)[number];

export const SIGHT_LOOK_PICTURE_MAX = 120_000;

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
  z.object({
    type: z.literal('call_start'),
    callId: ID,
    source: CALL_SOURCE,
    device: z.string().trim().min(1).max(80),
    chatId: z.uuid().optional(),
    answering: z.uuid().optional(),
    gated: z.boolean().optional(),
  }),
  z.object({ type: z.literal('call_end'), callId: ID }),
  z.object({ type: z.literal('mute'), callId: ID, muted: z.boolean() }),
  z.object({ type: z.literal('activity'), callId: ID, speaking: z.boolean() }),
  z.object({ type: z.literal('interrupt'), callId: ID }),
  z.object({ type: z.literal('call_resume'), callId: ID }),
  z.object({
    type: z.literal('sight_settings'),
    callId: ID,
    mode: SIGHT_MODE,
    memorySeconds: SIGHT_MEMORY_SECONDS,
    look: z.array(SIGHT_SOURCE).max(SIGHT_SOURCE.options.length),
    available: z.array(APP_SIGHT_SOURCE).max(APP_SIGHT_SOURCE.options.length),
  }),
  z.object({
    type: z.literal('sight_start'),
    callId: ID,
    source: APP_SIGHT_SOURCE,
    facing: SIGHT_FACING.optional(),
    label: z.string().trim().min(1).max(SIGHT_LABEL_MAX).optional(),
  }),
  z.object({ type: z.literal('sight_stop'), callId: ID, source: SIGHT_SOURCE }),
  z.object({
    type: z.literal('sight_still'),
    callId: ID,
    source: APP_SIGHT_SOURCE,
    label: z.string().trim().min(1).max(SIGHT_LABEL_MAX),
    lookId: ID,
  }),
  z.object({
    type: z.literal('sight_unavailable'),
    callId: ID,
    requestId: ID,
    refusal: SIGHT_REFUSAL,
    detail: z.string().max(200).nullable(),
  }),
  z.object({ type: z.literal('watch_camera'), callId: ID, cameraId: ID }),
  z.object({
    type: z.literal('sight_answer'),
    callId: ID,
    requestId: ID,
    accepted: z.boolean(),
  }),
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

export const CALL_CAPABILITIES = z.object({
  type: z.literal('capabilities'),
  sight: z.array(SIGHT_SOURCE),
  still: z.boolean(),
  interrupt: z.boolean(),
  resume: z.boolean(),
  maxFrameBytes: z.int().positive(),
  minFrameIntervalMs: z.int().positive(),
});

export type CallCapabilities = z.infer<typeof CALL_CAPABILITIES>;

export const ASSISTANT_VOICE_SERVER_MESSAGE = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    clientId: ID,
    available: z.boolean(),
    reason: z.string().max(200).nullable(),
  }),
  z.object({
    type: z.literal('call_state'),
    callId: ID,
    state: z.enum(CALL_STATES),
    chatId: ID.optional(),
  }),
  z.object({
    type: z.literal('caption'),
    callId: ID,
    who: z.enum(CAPTION_SPEAKERS),
    text: z.string().max(2000),
  }),
  z.object({ type: z.literal('interrupted'), callId: ID }),
  z.object({
    type: z.literal('ended'),
    callId: ID,
    reason: z.enum(CALL_ENDINGS),
    detail: z.string().max(200).nullable(),
  }),
  CALL_CAPABILITIES,
  z.object({
    type: z.literal('sight_state'),
    callId: ID,
    source: SIGHT_SOURCE,
    state: z.enum(['on', 'off']),
    reason: SIGHT_STOP_REASON.nullable(),
    detail: z.string().max(200).nullable(),
    label: z.string().max(SIGHT_LABEL_MAX).nullable(),
  }),
  z.object({
    type: z.literal('sight_request'),
    callId: ID,
    requestId: ID,
    what: SIGHT_SOURCE,
    why: z.string().max(300),
    target: z.string().max(SIGHT_TARGET_MAX).nullable(),
  }),
  z.object({
    type: z.literal('sight_capture'),
    callId: ID,
    requestId: ID,
    source: APP_SIGHT_SOURCE,
    target: z.string().max(SIGHT_TARGET_MAX).nullable(),
  }),
  z.object({
    type: z.literal('sight_looked'),
    callId: ID,
    lookId: ID,
    source: SIGHT_SOURCE,
    label: z.string().max(SIGHT_LABEL_MAX),
    at: z.iso.datetime({ offset: true }),
    trigger: SIGHT_LOOK_TRIGGER,
    picture: z.base64().max(SIGHT_LOOK_PICTURE_MAX).nullable(),
  }),
]);

export type AssistantVoiceServerMessage = z.infer<typeof ASSISTANT_VOICE_SERVER_MESSAGE>;

export function assistantVoiceProtocols(token: string): readonly [string, string] {
  return [ASSISTANT_VOICE_PROTOCOL, `${BEARER_PROTOCOL_PREFIX}${CLIENT_TOKEN.parse(token)}`];
}
