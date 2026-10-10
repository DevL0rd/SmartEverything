import { z } from 'zod';
import { BEARER_PROTOCOL_PREFIX, CLIENT_TOKEN } from './api/access';
import { SIGHT_FRAME_LIMITS, SIGHT_SOURCES, type SightSource } from './call-sight';
import { TALK_FRAME_BYTES_MAX, TALK_SPEAKER } from './talk';

const ID = z.uuid();

export const TALK_PROTOCOL = 'smarteverything.talk.v1';

export const TALK_PATH = '/talk';

export const TALK_AUDIO_FRAME = 0x01;

export const ASSISTANT_SIGHT_FRAME = 0x02;

export const SIGHT_FRAME_HEADER_BYTES = 3;

const SIGHT_STILL_FLAG = 0x01;

export const TALK_HEARTBEAT_MS = 60_000;

export const TALK_CLIENT_MESSAGE = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('press'), channelId: ID }),
  z.strictObject({ type: z.literal('listen'), channelId: ID, cameraId: ID }),
  z.strictObject({ type: z.literal('release') }),
]);

export type TalkClientMessage = z.infer<typeof TALK_CLIENT_MESSAGE>;

export const TALK_DENIALS = [
  'busy',
  'not_member',
  'talking_elsewhere',
  'camera_unavailable',
  'live_conversation',
] as const;

export type TalkDenial = (typeof TALK_DENIALS)[number];

export const TALK_ENDINGS = [
  'released',
  'time_limit',
  'channel_removed',
  'left',
  'disconnected',
  'failed',
] as const;

export type TalkEnding = (typeof TALK_ENDINGS)[number];

export const TALK_SERVER_MESSAGE = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), clientId: ID, channels: z.array(ID) }),
  z.strictObject({ type: z.literal('channels'), channels: z.array(ID) }),
  z.strictObject({
    type: z.literal('granted'),
    channelId: ID,
    messageId: ID,
    limitSeconds: z.int().positive(),
  }),
  z.strictObject({ type: z.literal('denied'), channelId: ID, reason: z.enum(TALK_DENIALS) }),
  z.strictObject({
    type: z.literal('ended'),
    messageId: ID,
    reason: z.enum(TALK_ENDINGS),
    detail: z.string().max(200).nullable(),
  }),
  z.strictObject({
    type: z.literal('rx_start'),
    channelId: ID,
    messageId: ID,
    speaker: TALK_SPEAKER,
  }),
  z.strictObject({ type: z.literal('rx_end'), messageId: ID }),
  z.strictObject({
    type: z.literal('live_start'),
    channelId: ID,
    conversationId: z.string().min(1).max(120),
    label: z.string().min(1).max(80),
  }),
  z.strictObject({
    type: z.literal('live_end'),
    channelId: ID,
    conversationId: z.string().min(1).max(120),
  }),
]);

export type TalkServerMessage = z.infer<typeof TALK_SERVER_MESSAGE>;

export class TalkFrameError extends Error {
  override readonly name = 'TalkFrameError';
}

export function audioFrameOf(packet: Uint8Array): Uint8Array {
  if (packet.byteLength === 0 || packet.byteLength > TALK_FRAME_BYTES_MAX) {
    throw new TalkFrameError(
      `An Opus packet is 1 to ${String(TALK_FRAME_BYTES_MAX)} bytes; this one is ${String(packet.byteLength)}.`,
    );
  }
  const frame = new Uint8Array(packet.byteLength + 1);
  frame[0] = TALK_AUDIO_FRAME;
  frame.set(packet, 1);
  return frame;
}

export function packetOfFrame(frame: Uint8Array): Uint8Array {
  if (frame[0] !== TALK_AUDIO_FRAME) {
    throw new TalkFrameError(`A talk frame starts with ${String(TALK_AUDIO_FRAME)}.`);
  }
  if (frame.byteLength < 2 || frame.byteLength > TALK_FRAME_BYTES_MAX + 1) {
    throw new TalkFrameError(`A talk frame of ${String(frame.byteLength)} bytes is not allowed.`);
  }
  return frame.subarray(1);
}

export function talkProtocols(token: string): readonly [string, string] {
  return [TALK_PROTOCOL, `${BEARER_PROTOCOL_PREFIX}${CLIENT_TOKEN.parse(token)}`];
}

export type FrameKind = 'audio' | 'sight';

export function frameKindOf(frame: Uint8Array): FrameKind {
  if (frame[0] === TALK_AUDIO_FRAME) {
    return 'audio';
  }
  if (frame[0] === ASSISTANT_SIGHT_FRAME) {
    return 'sight';
  }
  throw new TalkFrameError(
    `A call frame starts with ${String(TALK_AUDIO_FRAME)} or ${String(ASSISTANT_SIGHT_FRAME)}.`,
  );
}

export interface SightFrame {
  readonly source: SightSource;
  readonly still: boolean;
  readonly jpeg: Uint8Array;
}

export function sightFrameOf(frame: SightFrame): Uint8Array {
  const sourceCode = SIGHT_SOURCES.indexOf(frame.source);
  if (frame.jpeg.byteLength === 0 || frame.jpeg.byteLength > SIGHT_FRAME_LIMITS.maxBytes) {
    throw new TalkFrameError(
      `A picture is 1 to ${String(SIGHT_FRAME_LIMITS.maxBytes)} bytes; this one is ${String(frame.jpeg.byteLength)}.`,
    );
  }
  const bytes = new Uint8Array(frame.jpeg.byteLength + SIGHT_FRAME_HEADER_BYTES);
  bytes[0] = ASSISTANT_SIGHT_FRAME;
  bytes[1] = sourceCode;
  bytes[2] = frame.still ? SIGHT_STILL_FLAG : 0;
  bytes.set(frame.jpeg, SIGHT_FRAME_HEADER_BYTES);
  return bytes;
}

export function sightOfFrame(frame: Uint8Array): SightFrame {
  if (frame[0] !== ASSISTANT_SIGHT_FRAME) {
    throw new TalkFrameError(`A picture frame starts with ${String(ASSISTANT_SIGHT_FRAME)}.`);
  }
  const source = SIGHT_SOURCES[frame[1] ?? SIGHT_SOURCES.length];
  const size = frame.byteLength - SIGHT_FRAME_HEADER_BYTES;
  if (source === undefined) {
    throw new TalkFrameError(`A picture frame names source ${String(frame[1])}, which is unknown.`);
  }
  if (size < 1 || size > SIGHT_FRAME_LIMITS.maxBytes) {
    throw new TalkFrameError(
      `A picture frame of ${String(frame.byteLength)} bytes is not allowed.`,
    );
  }
  return {
    source,
    still: ((frame[2] ?? 0) & SIGHT_STILL_FLAG) !== 0,
    jpeg: frame.subarray(SIGHT_FRAME_HEADER_BYTES),
  };
}
