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
  linkedTo: ID.nullable(),
});

const TELEVISION_FIND = z.strictObject({
  outcome: z.enum(['linked', 'asking', 'not_found']),
  message: z.string().min(1),
});

export const TELEVISION_ENDPOINTS = {
  listTelevisionCandidates: endpoint({
    method: 'GET',
    path: '/api/televisions/:deviceId/direct/candidates',
    access: 'owner',
    summary:
      'Samsung screens found on the network that can be linked directly to this television, each with its own name, model, address, MAC and the device it is already linked to',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: z.array(TELEVISION_CANDIDATE),
  }),
  findTelevision: endpoint({
    method: 'POST',
    path: '/api/televisions/:deviceId/direct/find',
    access: 'member',
    summary:
      'Only for a television that is not linked directly: looks for it on the network once, saves its address when it is certain which screen it is, and starts the direct link so the screen shows its Allow prompt. A television that is already linked is not searched for',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: TELEVISION_FIND,
  }),
} as const;
