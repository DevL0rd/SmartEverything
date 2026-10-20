import { z } from 'zod';
import { MAC_ADDRESS } from '../mac-address';
import {
  EAR_CODEC,
  EAR_KEY,
  EAR_PACKET,
  EAR_SCORE,
  EAR_SCORE_FAILED,
  EAR_SCORED,
  EAR_SOURCE,
  LISTENING_CONFIG,
  LISTENING_HUB_MESSAGE,
  LISTENING_NODE_MESSAGE,
  REMOTE_EAR_HUB_MESSAGE,
  REMOTE_EAR_NODE_MESSAGE,
} from '../listening';
import { APP_EVENTS_FRAME } from './computer-app-events';
import { COMPUTER_SCOPES } from './computer-scopes';
import { COMPUTER_FEATURE_LIST } from './computer-features';
import { COMPUTER_ROLE } from './computer-role';
import { CORE_KINDS } from './computer-snapshot';
import { NODE_DEMAND, SAMPLE_PARTS, STATE_PARTS } from './computer-live';
import { MACHINE_ACTION_SUPPORTS, MACHINE_PERMISSION_STATES } from '../machine-actions';
import { NODE_REQUEST, NODE_RESULT, POWER_ACTIONS } from './node-requests';
import { NODE_REPORT } from './report';

export const NODE_INTERFACE = z.object({
  name: z.string().min(1),
  mac: MAC_ADDRESS,
  addresses: z.array(z.string().min(1)),
});

export type NodeInterface = z.infer<typeof NODE_INTERFACE>;

export const NODE_HELLO = z.object({
  machineId: z.string().regex(/^[0-9a-f]{32}$/),
  hostname: z.string().min(1),
  os: z.object({ name: z.string().min(1), kernel: z.string().min(1) }),
  hardware: z.object({
    vendor: z.string().min(1).nullable(),
    product: z.string().min(1).nullable(),
    portable: z.boolean(),
  }),
  cpu: z.object({
    model: z.string().min(1),
    threads: z.int().positive(),
    hybrid: z.boolean(),
    kinds: z.array(z.enum(CORE_KINDS)).default([]),
  }),
  memoryBytes: z.number().positive(),
  interfaces: z.array(NODE_INTERFACE),
  bootedAt: z.iso.datetime({ offset: true }),
  power: z.array(z.enum(POWER_ACTIONS)).default([]),
  features: COMPUTER_FEATURE_LIST.default([]),
  role: COMPUTER_ROLE.default('pc'),
  actions: MACHINE_ACTION_SUPPORTS.default([]),
  permissions: MACHINE_PERMISSION_STATES.default([]),
});

export type NodeHello = z.infer<typeof NODE_HELLO>;

const REQUEST_ID = z.string().min(1);

const FRAME_SEQUENCE = z.int().nonnegative();

export const NODE_SAMPLE_FRAME = z.object({
  type: z.literal('sample'),
  at: z.iso.datetime({ offset: true }),
  seq: FRAME_SEQUENCE,
  key: z.boolean().optional(),
  parts: SAMPLE_PARTS,
});

export type NodeSampleFrame = z.infer<typeof NODE_SAMPLE_FRAME>;

export const NODE_STATE_FRAME = z.object({
  type: z.literal('state'),
  at: z.iso.datetime({ offset: true }),
  parts: STATE_PARTS,
});

export type NodeStateFrame = z.infer<typeof NODE_STATE_FRAME>;

export const NODE_FRAME = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), hello: NODE_HELLO }),
  z.object({ type: z.literal('report'), report: NODE_REPORT }),
  z.object({
    type: z.literal('machine'),
    actions: MACHINE_ACTION_SUPPORTS,
    permissions: MACHINE_PERMISSION_STATES,
  }),
  z.object({ type: z.literal('features'), features: COMPUTER_FEATURE_LIST }),
  NODE_SAMPLE_FRAME,
  NODE_STATE_FRAME,
  APP_EVENTS_FRAME,
  z.object({ type: z.literal('reply'), id: REQUEST_ID, result: NODE_RESULT }),
  z.object({ type: z.literal('ear'), ear: LISTENING_NODE_MESSAGE }),
  z.object({ type: z.literal('ears'), key: EAR_KEY, ear: REMOTE_EAR_NODE_MESSAGE }),
  z.object({ type: z.literal('ears_scored'), ...EAR_SCORED.shape }),
  z.object({ type: z.literal('ears_score_failed'), ...EAR_SCORE_FAILED.shape }),
]);

export type NodeFrame = z.infer<typeof NODE_FRAME>;

export const HUB_FRAME = z.discriminatedUnion('type', [
  z.object({ type: z.literal('demand'), demand: NODE_DEMAND }),
  z.object({ type: z.literal('scopes'), scopes: COMPUTER_SCOPES }),
  z.object({ type: z.literal('request'), id: REQUEST_ID, request: NODE_REQUEST }),
  z.object({ type: z.literal('ear'), ear: LISTENING_HUB_MESSAGE }),
  z.object({
    type: z.literal('ears_open'),
    source: EAR_SOURCE,
    codec: EAR_CODEC,
    config: LISTENING_CONFIG,
  }),
  z.object({ type: z.literal('ears_audio'), key: EAR_KEY, packets: z.array(EAR_PACKET).min(1) }),
  z.object({ type: z.literal('ears_close'), key: EAR_KEY }),
  z.object({ type: z.literal('ears'), key: EAR_KEY, ear: REMOTE_EAR_HUB_MESSAGE }),
  z.object({ type: z.literal('ears_score'), ...EAR_SCORE.shape }),
]);

export type HubFrame = z.infer<typeof HUB_FRAME>;
