import {
  HUB_CONNECTION_METADATA,
  HUB_IDENTITY_PATH,
  HUB_PUBLIC_IDENTITY,
} from '../hub-connections';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const CONNECTION_ENDPOINTS = {
  hubIdentity: endpoint({
    method: 'GET',
    path: HUB_IDENTITY_PATH,
    access: 'public',
    summary:
      'Public hub identity hints; callers must verify TLS against an independently trusted pin',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: HUB_PUBLIC_IDENTITY,
  }),
  hubConnection: endpoint({
    method: 'GET',
    path: '/api/connection',
    access: 'member',
    summary: 'This paired hub identity and its authenticated endpoint inventory',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: HUB_CONNECTION_METADATA,
  }),
} as const;
