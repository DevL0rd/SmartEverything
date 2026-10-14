import { z } from 'zod';
import { CLAUDE_NOTICES } from '../claude';
import { COMPUTER_AI_CAPABILITIES, COMPUTER_AI_SETTINGS } from '../computer-ai';
import { COMPUTER_AI_REPLY, COMPUTER_AI_REQUEST } from './ai-requests';
import { NODE_HELLO } from './frames';
import { PROVIDER_EVENT } from './provider-turns';

export const NODE_AI_PATH = '/api/nodes/socket';
export const NODE_AI_PROTOCOL = 'smarteverything-node-ai.v1';
export const NODE_AI_TOKEN = z.string().regex(/^sen_[A-Za-z0-9_-]{43}$/);
const BOUND = { device_id: z.uuid(), generation: z.uuid() };
const FAILURE = z.strictObject({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
});
export const NODE_AI_FRAME = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hello'), protocol: z.literal(1), hello: NODE_HELLO }),
  z.strictObject({
    ...BOUND,
    type: z.literal('capabilities'),
    capabilities: COMPUTER_AI_CAPABILITIES,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('reply'),
    id: z.uuid(),
    result: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), reply: COMPUTER_AI_REPLY }),
      z.strictObject({ ok: z.literal(false), failure: FAILURE }),
    ]),
  }),
  z.strictObject({ ...BOUND, type: z.literal('provider_event'), event: PROVIDER_EVENT }),
  z.strictObject({
    ...BOUND,
    type: z.literal('native_event'),
    notice: z.discriminatedUnion('type', CLAUDE_NOTICES),
  }),
]);
export type NodeAiFrame = z.infer<typeof NODE_AI_FRAME>;
export const HUB_AI_CONTROL = z.discriminatedUnion('type', [
  z.strictObject({ ...BOUND, type: z.literal('welcome'), settings: COMPUTER_AI_SETTINGS }),
  z.strictObject({
    ...BOUND,
    type: z.literal('request'),
    id: z.uuid(),
    request: COMPUTER_AI_REQUEST,
  }),
]);
export type HubAiControl = z.infer<typeof HUB_AI_CONTROL>;
