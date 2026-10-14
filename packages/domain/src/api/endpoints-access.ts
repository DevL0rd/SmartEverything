import { z } from 'zod';
import { LEGACY_PAIRING_QR, PAIRING_CODE, PAIRING_QR } from './access';
import { NO_BODY, endpoint } from './endpoint';
import { CLIENT_NAME, CLIENT_ROW } from './rows-home';
import { DONE, ID, MOMENT, NOTHING, ROLE, somethingToChange } from './primitives';

export const PUBLIC_STATUS = z.strictObject({
  service: z.literal('smarteverything'),
  version: z.string().min(1),
  uptimeSeconds: z.int().min(0),
  publicUrl: z.strictObject({ configured: z.boolean(), verified: z.boolean() }),
});

export type PublicStatus = z.infer<typeof PUBLIC_STATUS>;

export const CAMERA_SERVICE_STATES = ['running', 'stopped'] as const;

export const HUB_STATUS = z.strictObject({
  version: z.string().min(1),
  startedAt: MOMENT,
  cameras: z.enum(CAMERA_SERVICE_STATES),
});

export type HubStatus = z.infer<typeof HUB_STATUS>;

export const SESSION = z.strictObject({ client: CLIENT_ROW, hub: HUB_STATUS });

export const PAIRING = z.strictObject({
  code: PAIRING_CODE,
  expiresAt: MOMENT,
  qr: PAIRING_QR,
  legacyQr: LEGACY_PAIRING_QR.optional(),
});

export type Pairing = z.infer<typeof PAIRING>;

export const PAIRED_PLATFORMS = ['android', 'web'] as const;

export const ISSUED_TOKEN = z.strictObject({ token: z.string().min(1) });

const CLIENT_PARAMS = z.strictObject({ clientId: ID });

export const ACCESS_ENDPOINTS = {
  status: endpoint({
    method: 'GET',
    path: '/status',
    access: 'public',
    summary: 'Whether the server is up, its version and whether its public URL is verified',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PUBLIC_STATUS,
  }),
  session: endpoint({
    method: 'GET',
    path: '/api/session',
    access: 'member',
    summary: 'The calling client and the hub status',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: SESSION,
  }),
  startPairing: endpoint({
    method: 'POST',
    path: '/api/pair/start',
    access: 'owner',
    summary: 'A one-time pairing code and the QR payload a phone scans',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ role: ROLE, connectionProtocolVersion: z.literal(1).optional() }),
    response: PAIRING,
  }),
  claimPairing: endpoint({
    method: 'POST',
    path: '/api/pair/claim',
    access: 'public',
    summary: 'Exchange a pairing code for a device token, returned once',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      code: PAIRING_CODE,
      name: CLIENT_NAME,
      platform: z.enum(PAIRED_PLATFORMS),
    }),
    response: ISSUED_TOKEN.extend({ client: CLIENT_ROW }),
  }),
  listClients: endpoint({
    method: 'GET',
    path: '/api/clients',
    access: 'owner',
    summary: 'Every paired client',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(CLIENT_ROW),
  }),
  updateClient: endpoint({
    method: 'PATCH',
    path: '/api/clients/:clientId',
    access: 'owner',
    summary: 'Rename a client, change its role or choose whose profile it uses',
    params: CLIENT_PARAMS,
    query: NOTHING,
    body: somethingToChange({ name: CLIENT_NAME, role: ROLE, profile_id: ID }),
    response: CLIENT_ROW,
  }),
  removeClient: endpoint({
    method: 'DELETE',
    path: '/api/clients/:clientId',
    access: 'owner',
    summary: 'Unpair a client; its token stops working at once',
    params: CLIENT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  rotateOwnerToken: endpoint({
    method: 'POST',
    path: '/api/owner-token/rotate',
    access: 'owner',
    summary: 'Replace the owner token; the old one stops working at once',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: ISSUED_TOKEN,
  }),
} as const;
