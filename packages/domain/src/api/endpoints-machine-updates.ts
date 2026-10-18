import { MACHINE_UPDATE_OFFER, MACHINE_UPDATE_QUERY } from '../machine-updates';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const MACHINE_UPDATE_ENDPOINTS = {
  readMachineUpdate: endpoint({
    method: 'GET',
    path: '/api/machine-update',
    access: 'member',
    summary:
      'Read the newest desktop app release this home offers for one platform and architecture, with short-lived download links, or null when no release is stored',
    params: NOTHING,
    query: MACHINE_UPDATE_QUERY,
    body: NO_BODY,
    response: MACHINE_UPDATE_OFFER.nullable(),
  }),
} as const;
