import { z } from 'zod';
import { MAC_ADDRESS } from '../mac-address';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING } from './primitives';

const TELEVISION_CANDIDATE = z.strictObject({
  host: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1).nullable(),
  macAddress: MAC_ADDRESS.nullable(),
  likely: z.boolean(),
});

export const TELEVISION_ENDPOINTS = {
  listTelevisionCandidates: endpoint({
    method: 'GET',
    path: '/api/televisions/:deviceId/direct/candidates',
    access: 'owner',
    summary:
      'Samsung televisions found on the network that can be linked directly to this television',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: z.array(TELEVISION_CANDIDATE),
  }),
} as const;
