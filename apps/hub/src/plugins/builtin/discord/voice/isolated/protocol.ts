import { z } from 'zod';
import { SNOWFLAKE } from '../../ids';
import { DAVE_TROUBLE, VOICE_SERVER, VOICE_STATE, VOICE_STATE_PAYLOAD } from '../link';

const PACKET = z.custom<Uint8Array>((value) => value instanceof Uint8Array);
const LINK = z.string().min(1);

export const CONNECT_CALL = 'connect';

export const CONNECT_INPUT = z.strictObject({
  linkId: LINK,
  guildId: SNOWFLAKE,
  channelId: SNOWFLAKE,
  muted: z.boolean(),
});

function message<N extends string, P extends z.ZodType>(
  name: N,
  payload: P,
): z.ZodObject<{ name: z.ZodLiteral<N>; payload: P }, z.core.$strict> {
  return z.strictObject({ name: z.literal(name), payload });
}

export const COMMAND = z.discriminatedUnion('name', [
  message('server', z.strictObject({ guildId: SNOWFLAKE, data: VOICE_SERVER })),
  message('state', z.strictObject({ guildId: SNOWFLAKE, data: VOICE_STATE })),
  message(
    'listen',
    z.strictObject({
      linkId: LINK,
      streamId: z.number().int(),
      userId: SNOWFLAKE,
      silenceMs: z.number().int().positive(),
    }),
  ),
  message('play', z.strictObject({ linkId: LINK, packet: PACKET })),
  message('stop', z.strictObject({ linkId: LINK })),
  message('mute', z.strictObject({ linkId: LINK, muted: z.boolean() })),
  message('destroy', z.strictObject({ linkId: LINK })),
]);

export const EVENT = z.discriminatedUnion('name', [
  message('gatewaySend', z.strictObject({ guildId: SNOWFLAKE, payload: VOICE_STATE_PAYLOAD })),
  message('speaking', z.strictObject({ linkId: LINK, userId: SNOWFLAKE })),
  message('audio', z.strictObject({ linkId: LINK, streamId: z.number().int(), packet: PACKET })),
  message('dave', z.strictObject({ linkId: LINK, trouble: DAVE_TROUBLE })),
  message('audioEnd', z.strictObject({ linkId: LINK, streamId: z.number().int() })),
  message(
    'closed',
    z.strictObject({
      linkId: LINK,
      reason: z.enum(['closed', 'decrypt']),
      cause: z.string().nullable(),
    }),
  ),
]);

export type VoiceCommand = z.input<typeof COMMAND>;
export type VoiceEvent = z.output<typeof EVENT>;
export type ParsedCommand = z.output<typeof COMMAND>;
