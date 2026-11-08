import { z } from 'zod';
import { SERVER_PORT } from '../chat-pages';

const STREAM = z.uuid();
const HEADERS = z.record(z.string(), z.union([z.string(), z.array(z.string())]));
const DATA = z.base64();

export const RELAY_HUB_FRAMES = [
  z.object({
    type: z.literal('relay_open'),
    stream: STREAM,
    port: SERVER_PORT,
    method: z.string().regex(/^[A-Z]{1,16}$/u),
    path: z
      .string()
      .regex(/^\/(?!\/)/u)
      .max(8192),
    headers: HEADERS,
    websocket: z.boolean(),
  }),
  z.object({ type: z.literal('relay_data'), stream: STREAM, data: DATA, text: z.boolean() }),
  z.object({ type: z.literal('relay_end'), stream: STREAM }),
  z.object({ type: z.literal('relay_close'), stream: STREAM }),
] as const;

export const RELAY_NODE_FRAMES = [
  z.object({
    type: z.literal('relay_head'),
    stream: STREAM,
    status: z.int().min(100).max(599),
    headers: HEADERS,
  }),
  z.object({ type: z.literal('relay_data'), stream: STREAM, data: DATA, text: z.boolean() }),
  z.object({ type: z.literal('relay_end'), stream: STREAM }),
  z.object({ type: z.literal('relay_failed'), stream: STREAM, reason: z.string().max(4096) }),
] as const;

export const RELAY_HUB_FRAME = z.discriminatedUnion('type', RELAY_HUB_FRAMES);
export type RelayHubFrame = z.infer<typeof RELAY_HUB_FRAME>;
export const RELAY_NODE_FRAME = z.discriminatedUnion('type', RELAY_NODE_FRAMES);
export type RelayNodeFrame = z.infer<typeof RELAY_NODE_FRAME>;
export type RelayHeaders = z.infer<typeof HEADERS>;
