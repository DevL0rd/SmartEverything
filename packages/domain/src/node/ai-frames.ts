import { z } from 'zod';
import {
  COMPUTER_AI_RUNTIME,
  COMPUTER_RUNTIME_CAPABILITIES,
  COMPUTER_RUNTIME_SETTINGS,
} from '../computer-ai-runtime';
import { API_ERROR_CODES } from '../api/errors';
import { CLAUDE_NOTICES } from '../claude';
import { CODEX_NATIVE_NOTICE } from '../codex-prompts';
import { COMPUTER_RUNTIME_REQUEST, COMPUTER_RUNTIME_REPLY } from './runtime-requests';
import { COMPUTER_RUNTIME_PROVIDER_EVENT } from './runtime-provider';
import { NODE_HELLO } from './frames';

export const NODE_AI_PATH = '/api/nodes/socket';
export const NODE_AI_PROTOCOL = 'smarteverything-node-ai.managed-project-v1';
export const NODE_AI_TOKEN = z.string().regex(/^sen_[A-Za-z0-9_-]{43}$/);
const BOUND = { device_id: z.uuid(), generation: z.uuid() };
export const COMPUTER_RUNTIME_NATIVE_EVENT = z.discriminatedUnion('runtime', [
  z.strictObject({
    runtime: z.literal('claude'),
    notice: z.discriminatedUnion('type', CLAUDE_NOTICES),
  }),
  z.strictObject({ runtime: z.literal('codex'), notice: CODEX_NATIVE_NOTICE }),
]);
export type ComputerRuntimeNativeEvent = z.infer<typeof COMPUTER_RUNTIME_NATIVE_EVENT>;
export const NODE_RUNTIME_FRAME = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('hello'),
    protocol: z.literal(2),
    hello: NODE_HELLO,
    runtimes: z
      .array(COMPUTER_AI_RUNTIME)
      .min(1)
      .max(2)
      .refine(
        (values) => new Set(values).size === values.length,
        'Runtime registrations must be unique.',
      ),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('capabilities'),
    runtime: COMPUTER_AI_RUNTIME,
    capabilities: COMPUTER_RUNTIME_CAPABILITIES,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('reply'),
    id: z.uuid(),
    result: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), reply: COMPUTER_RUNTIME_REPLY }),
      z.strictObject({
        ok: z.literal(false),
        failure: z.strictObject({
          code: z.enum(API_ERROR_CODES),
          message: z.string().min(1).max(2000),
        }),
      }),
    ]),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('provider_event'),
    payload: COMPUTER_RUNTIME_PROVIDER_EVENT,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('native_event'),
    payload: COMPUTER_RUNTIME_NATIVE_EVENT,
  }),
]);
export type NodeRuntimeFrame = z.infer<typeof NODE_RUNTIME_FRAME>;
export const HUB_RUNTIME_CONTROL = z.discriminatedUnion('type', [
  z.strictObject({
    ...BOUND,
    type: z.literal('welcome'),
    runtimes: z.array(COMPUTER_RUNTIME_SETTINGS).min(1).max(2),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('request'),
    id: z.uuid(),
    request: COMPUTER_RUNTIME_REQUEST,
  }),
]);
export type HubRuntimeControl = z.infer<typeof HUB_RUNTIME_CONTROL>;
