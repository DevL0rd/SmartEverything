import { z } from 'zod';
import { COMPUTER_SCOPES } from './computer-scopes';
import { COMPUTER_SESSION } from './computer-session-state';
import { COMPUTER_SNAPSHOT } from './computer-snapshot';
import { NODE_REQUEST, NODE_RESULT, POWER_ACTIONS } from './node-requests';
import { NODE_REPORT } from './report';

const MAC = z.string().regex(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);

export const NODE_INTERFACE = z.strictObject({
  name: z.string().min(1),
  mac: MAC,
  addresses: z.array(z.string().min(1)),
});

export type NodeInterface = z.infer<typeof NODE_INTERFACE>;

export const NODE_HELLO = z.strictObject({
  machineId: z.string().regex(/^[0-9a-f]{32}$/),
  hostname: z.string().min(1),
  os: z.strictObject({ name: z.string().min(1), kernel: z.string().min(1) }),
  hardware: z.strictObject({
    vendor: z.string().min(1).nullable(),
    product: z.string().min(1).nullable(),
    portable: z.boolean(),
  }),
  cpu: z.strictObject({
    model: z.string().min(1),
    threads: z.int().positive(),
    hybrid: z.boolean(),
  }),
  memoryBytes: z.number().positive(),
  interfaces: z.array(NODE_INTERFACE),
  bootedAt: z.iso.datetime({ offset: true }),
  power: z.array(z.enum(POWER_ACTIONS)).default([]),
});

export type NodeHello = z.infer<typeof NODE_HELLO>;

const REQUEST_ID = z.string().min(1).max(64);

export const NODE_PACES = ['live', 'idle'] as const;

export type NodePace = (typeof NODE_PACES)[number];

export const NODE_FRAME = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hello'), hello: NODE_HELLO }),
  z.strictObject({ type: z.literal('report'), report: NODE_REPORT }),
  z.strictObject({ type: z.literal('snapshot'), snapshot: COMPUTER_SNAPSHOT }),
  z.strictObject({ type: z.literal('reply'), id: REQUEST_ID, result: NODE_RESULT }),
  z.strictObject({ type: z.literal('session'), session: COMPUTER_SESSION }),
]);

export type NodeFrame = z.infer<typeof NODE_FRAME>;

export const HUB_FRAME = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('pace'), pace: z.enum(NODE_PACES) }),
  z.strictObject({ type: z.literal('scopes'), scopes: COMPUTER_SCOPES }),
  z.strictObject({ type: z.literal('request'), id: REQUEST_ID, request: NODE_REQUEST }),
]);

export type HubFrame = z.infer<typeof HUB_FRAME>;
