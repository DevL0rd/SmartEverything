import { z } from 'zod';
import { JSON_VALUE } from '../values';
import { CAPTURE_TARGETS } from './computer-capture';
import { FILE_PATH } from './computer-files';
import { PROCESS_QUERY, PROCESS_SIGNALS } from './computer-processes';
import { MEDIA_STATUSES } from './computer-session-state';

export const POWER_ACTIONS = [
  'shut_down',
  'restart',
  'sleep',
  'hibernate',
  'lock_screen',
  'sign_out',
] as const;

export type PowerAction = (typeof POWER_ACTIONS)[number];

export const COMPUTER_ACTIONS = [...POWER_ACTIONS, 'wake'] as const;

export type ComputerAction = (typeof COMPUTER_ACTIONS)[number];

const APP_ID = z.string().min(1).max(200);

export const NODE_REQUEST = z.discriminatedUnion('verb', [
  z.strictObject({ verb: z.literal('power'), action: z.enum(POWER_ACTIONS) }),
  z.strictObject({ verb: z.literal('processes'), query: PROCESS_QUERY }),
  z.strictObject({
    verb: z.literal('signal'),
    pid: z.int().positive(),
    signal: z.enum(PROCESS_SIGNALS),
  }),
  z.strictObject({ verb: z.literal('links') }),
  z.strictObject({ verb: z.literal('volume'), level: z.number().min(0).max(100) }),
  z.strictObject({ verb: z.literal('mute'), muted: z.boolean() }),
  z.strictObject({ verb: z.literal('playback'), status: z.enum(MEDIA_STATUSES) }),
  z.strictObject({ verb: z.literal('apps') }),
  z.strictObject({ verb: z.literal('open_app'), appId: APP_ID }),
  z.strictObject({ verb: z.literal('close_app'), appId: APP_ID, force: z.boolean() }),
  z.strictObject({ verb: z.literal('files'), path: FILE_PATH.nullable() }),
  z.strictObject({ verb: z.literal('file'), path: FILE_PATH }),
  z.strictObject({ verb: z.literal('capture'), target: z.enum(CAPTURE_TARGETS) }),
]);

export type NodeRequest = z.infer<typeof NODE_REQUEST>;

export const NODE_FAILURE_CODES = [
  'scope_off',
  'not_supported',
  'not_permitted',
  'blocked',
  'not_found',
  'not_own',
  'no_session',
  'failed',
] as const;

export type NodeFailureCode = (typeof NODE_FAILURE_CODES)[number];

export const NODE_FAILURE = z.strictObject({
  code: z.enum(NODE_FAILURE_CODES),
  message: z.string().min(1).max(500),
});

export type NodeFailure = z.infer<typeof NODE_FAILURE>;

export const NODE_RESULT = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: JSON_VALUE }),
  z.strictObject({ ok: z.literal(false), failure: NODE_FAILURE }),
]);

export type NodeResult = z.infer<typeof NODE_RESULT>;
