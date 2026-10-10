import { z } from 'zod';
import { SNOWFLAKE } from '../ids';

export const VOICE_STATE = z.looseObject({
  guild_id: SNOWFLAKE.optional(),
  channel_id: SNOWFLAKE.nullable(),
  user_id: SNOWFLAKE,
  session_id: z.string(),
  deaf: z.boolean(),
  mute: z.boolean(),
  self_deaf: z.boolean(),
  self_mute: z.boolean(),
  self_video: z.boolean(),
  suppress: z.boolean(),
  request_to_speak_timestamp: z.string().nullable(),
  member: z
    .looseObject({
      nick: z.string().nullish(),
      user: z
        .looseObject({
          id: SNOWFLAKE,
          username: z.string().nullish(),
          global_name: z.string().nullish(),
        })
        .optional(),
    })
    .optional(),
});

export type VoiceState = z.output<typeof VOICE_STATE>;

export const VOICE_SERVER = z.looseObject({
  token: z.string(),
  guild_id: SNOWFLAKE,
  endpoint: z.string().nullable(),
});

export type VoiceServer = z.output<typeof VOICE_SERVER>;

export const GUILD_VOICE_STATES = z.looseObject({
  id: SNOWFLAKE,
  voice_states: z
    .array(z.looseObject({ user_id: SNOWFLAKE, channel_id: SNOWFLAKE.nullable() }))
    .default([]),
});

export const VOICE_STATE_PAYLOAD = z.strictObject({
  op: z.literal(4),
  d: z.strictObject({
    guild_id: SNOWFLAKE,
    channel_id: SNOWFLAKE.nullable(),
    self_mute: z.boolean(),
    self_deaf: z.boolean(),
  }),
});

export type VoiceStatePayload = z.output<typeof VOICE_STATE_PAYLOAD>;

export interface VoiceSignals {
  readonly server: (data: VoiceServer) => void;
  readonly state: (data: VoiceState) => void;
}

export interface VoiceGateway {
  readonly send: (guildId: string, payload: unknown) => boolean;
  readonly watch: (guildId: string, signals: VoiceSignals) => () => void;
}

export type VoiceClosing = 'closed' | 'decrypt';

export interface VoiceLink {
  readonly channelId: string;
  readonly muted: () => boolean;
  readonly setMuted: (muted: boolean) => boolean;
  readonly onSpeaking: (listener: (userId: string) => void) => void;
  readonly listen: (userId: string, silenceMs: number) => AsyncIterable<Uint8Array>;
  readonly play: (packet: Uint8Array) => void;
  readonly stop: () => void;
  readonly onClosed: (listener: (reason: VoiceClosing, cause: unknown) => void) => void;
  readonly destroy: () => void;
}

export const DAVE_TROUBLE = z.strictObject({
  stage: z.enum(['decrypt', 'encrypt', 'not_ready', 'session']),
  message: z.string(),
  protocolVersion: z.number().int().nullable(),
  ready: z.boolean().nullable(),
  reinitializing: z.boolean().nullable(),
  lastTransitionId: z.number().int().nullable(),
  recovery: z.enum(['passthrough', 'resubscribed', 'dropped', 'waiting', 'ended']),
});

export type DaveTrouble = z.output<typeof DAVE_TROUBLE>;

interface VoiceRequest {
  readonly guildId: string;
  readonly channelId: string;
  readonly muted: boolean;
  readonly gateway: VoiceGateway;
}

interface WorkerVoiceRequest extends VoiceRequest {
  readonly trouble: (trouble: DaveTrouble) => void;
}

export type VoiceConnect = (request: VoiceRequest) => Promise<VoiceLink>;

export type WorkerVoiceConnect = (request: WorkerVoiceRequest) => Promise<VoiceLink>;

export class VoiceConnectError extends Error {
  override readonly name = 'VoiceConnectError';

  constructor(
    readonly channelId: string,
    cause: unknown,
  ) {
    super('Could not connect to the voice channel', { cause });
  }
}

export interface VoiceBackend {
  readonly connect: VoiceConnect;
  readonly issue: () => string | null;
  readonly onIssue: (listener: () => void) => void;
}
