import { z } from 'zod';
import { COMPUTER_NODE_PAIRED, COMPUTER_NODE_PAIRING } from '../computer-nodes';
import { NODE_HELLO } from '../node/frames';
import { PAIRING_CODE } from './access';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const COMPUTER_NODE_ENDPOINTS = {
  pairComputerNode: endpoint({
    method: 'POST',
    path: '/api/nodes/pairing',
    access: 'owner',
    summary: 'Issue a one-time scoped computer-service pairing code for the hub URL',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ url: z.url({ protocol: /^https?$/ }).max(2000) }),
    response: COMPUTER_NODE_PAIRING,
  }),
  claimComputerNode: endpoint({
    method: 'POST',
    path: '/api/nodes/pairing/claim',
    access: 'public',
    summary:
      'Consume a computer pairing code and bind a dedicated node token to its machine identity',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ code: PAIRING_CODE, hello: NODE_HELLO }),
    response: COMPUTER_NODE_PAIRED,
  }),
  revokeComputerNode: endpoint({
    method: 'DELETE',
    path: '/api/computers/:deviceId/node',
    access: 'owner',
    summary: 'Revoke the computer-service token and close its connection immediately',
    params: z.strictObject({ deviceId: z.uuid() }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
