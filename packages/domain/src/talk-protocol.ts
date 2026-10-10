import { z } from 'zod';
import { BEARER_PROTOCOL_PREFIX, CLIENT_TOKEN } from './api/access';
import { TALK_FRAME_BYTES_MAX, TALK_SPEAKER } from './talk';

const ID = z.uuid();

export const TALK_PROTOCOL = 'smarteverything.talk.v1';

export const TALK_PATH = '/talk';

export const TALK_AUDIO_FRAME = 0x01;

export const TALK_HEARTBEAT_MS = 15_000;

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
