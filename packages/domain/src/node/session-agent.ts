import { z } from 'zod';
import { MACHINE_OPEN_TARGET, MACHINE_PERMISSION_STATES } from '../machine-actions';
import { CAPTURE_TARGETS, COMPUTER_CAPTURE } from './computer-capture';

export const SESSION_AGENT_FILE = 'session-agent.json';

export const SESSION_AGENT_ADDRESS = z.strictObject({
  socket: z.string().min(1),
  token: z.string().min(32),
  pid: z.int().positive(),
});

export type SessionAgentAddress = z.infer<typeof SESSION_AGENT_ADDRESS>;

const REQUEST_ID = z.string().min(1).max(100);

export const SESSION_AGENT_OPERATION = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('ping') }),
  z.strictObject({ op: z.literal('open'), target: MACHINE_OPEN_TARGET }),
  z.strictObject({ op: z.literal('ring'), on: z.boolean() }),
  z.strictObject({ op: z.literal('capture'), target: z.enum(CAPTURE_TARGETS) }),
  z.strictObject({ op: z.literal('permissions') }),
]);

export type SessionAgentOperation = z.infer<typeof SESSION_AGENT_OPERATION>;

export const SESSION_AGENT_REQUEST = z.strictObject({
  id: REQUEST_ID,
  token: z.string().min(1),
  operation: SESSION_AGENT_OPERATION,
});

export type SessionAgentRequest = z.infer<typeof SESSION_AGENT_REQUEST>;

export const SESSION_AGENT_FAILURE_CODES = [
  'unauthorized',
  'invalid_request',
  'not_supported',
  'failed',
] as const;

export const SESSION_AGENT_REPLY = z.discriminatedUnion('ok', [
  z.strictObject({
    type: z.literal('reply'),
    id: REQUEST_ID,
    ok: z.literal(true),
    capture: COMPUTER_CAPTURE.nullable(),
    permissions: MACHINE_PERMISSION_STATES.nullable(),
  }),
  z.strictObject({
    type: z.literal('reply'),
    id: REQUEST_ID,
    ok: z.literal(false),
    code: z.enum(SESSION_AGENT_FAILURE_CODES),
    message: z.string().min(1).max(500),
  }),
]);

export const SESSION_AGENT_EVENT = z.strictObject({
  type: z.literal('event'),
  event: z.literal('ring_ended'),
});

export const SESSION_AGENT_MESSAGE = z.union([SESSION_AGENT_REPLY, SESSION_AGENT_EVENT]);

export type SessionAgentReply = z.infer<typeof SESSION_AGENT_REPLY>;

export type SessionAgentMessage = z.infer<typeof SESSION_AGENT_MESSAGE>;
