import { z } from 'zod';
import { HUB_CONNECTION_METADATA } from './hub-connections';
import { NODE_AI_TOKEN } from './node/ai-frames';

export const COMPUTER_NODE_ROW = z.strictObject({
  device_id: z.uuid(),
  machine_id: z.string().regex(/^[0-9a-f]{32}$/),
  hub_url: z.url({ protocol: /^https?$/ }).max(2000),
  paired_at: z.iso.datetime({ offset: true }),
  revoked_at: z.iso.datetime({ offset: true }).nullable(),
});
export type ComputerNodeRow = z.infer<typeof COMPUTER_NODE_ROW>;
export const COMPUTER_NODE_PAIRING = z.strictObject({
  code: z.string().min(1),
  expires_at: z.iso.datetime({ offset: true }),
  url: z.url({ protocol: /^https?$/ }),
});
export const COMPUTER_NODE_PAIRED = z.strictObject({
  token: NODE_AI_TOKEN,
  device_id: z.uuid(),
  hub_url: z.url({ protocol: /^https?$/ }),
});

export const COMPUTER_MCP_TOKEN = z.string().regex(/^scg_[A-Za-z0-9_-]{43}$/);
export const COMPUTER_MCP_GRANT_PATH = '/api/nodes/claude-grant';
export const COMPUTER_MCP_GRANT_REQUEST = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('issue') }),
  z.strictObject({ action: z.literal('revoke') }),
  z.strictObject({ action: z.literal('verify'), token: COMPUTER_MCP_TOKEN }),
]);
export const COMPUTER_MCP_GRANT_RESPONSE = z.strictObject({
  token: COMPUTER_MCP_TOKEN.nullable(),
  url: z.url({ protocol: /^https?$/ }),
  valid: z.boolean(),
});

export const NODE_CONNECTION_PATH = '/api/nodes/connection';
export const NODE_CONNECTION_RESPONSE = z.object({
  device_id: z.uuid(),
  connection: HUB_CONNECTION_METADATA,
});
