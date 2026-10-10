import { z } from 'zod';
import { NO_BODY, endpoint } from './endpoint';
import { MOMENT, NOTHING } from './primitives';

export const SMARTTHINGS_TOKEN_PAGE = 'https://account.smartthings.com/tokens';

export const SMARTTHINGS_TOKEN_SCOPES = ['r:apps:*', 'w:apps:*'] as const;

const TOKEN_SCOPE = z.enum(SMARTTHINGS_TOKEN_SCOPES);

export const SMARTTHINGS_WEBHOOK = z.strictObject({
  confirmedAt: MOMENT.nullable(),
  lastEventAt: MOMENT.nullable(),
  lastError: z.string().nullable(),
});

export type SmartThingsWebhook = z.infer<typeof SMARTTHINGS_WEBHOOK>;

const SMARTTHINGS_APP_STATUS = z.strictObject({
  app: z.strictObject({ appId: z.string().nullable(), clientId: z.string() }).nullable(),
  publicUrl: z.enum(['missing', 'unverified', 'verified']),
  redirectUri: z.url().nullable(),
  webhookUrl: z.url().nullable(),
  webhook: SMARTTHINGS_WEBHOOK,
});

export type SmartThingsAppStatus = z.infer<typeof SMARTTHINGS_APP_STATUS>;

const SMARTTHINGS_AUTHORIZATION = z.strictObject({ url: z.url(), expiresAt: MOMENT });

const REASON = z.string().min(1);

const SMARTTHINGS_SETUP = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.literal('ready'),
    authorization: SMARTTHINGS_AUTHORIZATION,
    status: SMARTTHINGS_APP_STATUS,
  }),
  z.strictObject({ outcome: z.literal('token_refused'), reason: REASON }),
  z.strictObject({
    outcome: z.literal('scopes_missing'),
    missing: z.array(TOKEN_SCOPE).min(1),
    reason: REASON,
  }),
  z.strictObject({
    outcome: z.literal('rate_limited'),
    retryAfterSeconds: z.number().int().nonnegative().nullable(),
    reason: REASON,
  }),
  z.strictObject({
    outcome: z.literal('not_confirmed'),
    reason: REASON,
    status: SMARTTHINGS_APP_STATUS,
  }),
]);

export type SmartThingsSetup = z.infer<typeof SMARTTHINGS_SETUP>;

export const SMARTTHINGS_ENDPOINTS = {
  readSmartThingsApp: endpoint({
    method: 'GET',
    path: '/api/providers/smartthings/app',
    access: 'owner',
    summary: 'Whether the SmartThings app exists, its public URLs and webhook state',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: SMARTTHINGS_APP_STATUS,
  }),
  setUpSmartThings: endpoint({
    method: 'POST',
    path: '/api/providers/smartthings/setup',
    access: 'owner',
    summary: 'Create or update the SmartThings app with a one-time personal access token',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ token: z.string().trim().min(1).max(200) }),
    response: SMARTTHINGS_SETUP,
  }),
  authorizeSmartThings: endpoint({
    method: 'POST',
    path: '/api/providers/smartthings/authorize',
    access: 'owner',
    summary: 'A SmartThings sign-in URL with a ten-minute state',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: SMARTTHINGS_AUTHORIZATION,
  }),
} as const;
