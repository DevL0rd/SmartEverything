import { z } from 'zod';
import { GOOGLE_ACCOUNT_ROW, GOOGLE_PRODUCT, GOOGLE_SYNC_LOG_ENTRY } from '../google-accounts';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING } from './primitives';

const PERSON_QUERY = z.strictObject({ personId: ID.optional() });

const CHANNEL_PARAMS = z.strictObject({ channelId: z.string().min(1) });

export const GOOGLE_LINK_PLATFORMS = ['desktop', 'android'] as const;

export const GOOGLE_LINK_PRODUCT = z.strictObject({
  product: GOOGLE_PRODUCT,
  readOnly: z.boolean(),
});

export const GOOGLE_LINK_START = z.strictObject({
  platform: z.enum(GOOGLE_LINK_PLATFORMS),
  redirectUri: z.url(),
  products: z.array(GOOGLE_LINK_PRODUCT).min(1),
});

export const GOOGLE_LINK_STARTED = z.strictObject({
  authUrl: z.url(),
  state: z.string().min(1),
});

export const GOOGLE_LINK_FINISH = z.strictObject({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectUri: z.url(),
});

export const GOOGLE_APP_BODY = z.strictObject({
  androidClientId: z.string().min(1),
  desktopClientId: z.string().min(1),
  desktopClientSecret: z.string().min(1),
});

export const GOOGLE_ACCOUNT_PATCH = z.strictObject({
  calendar_ids: z.array(z.string().min(1)).optional(),
  list_ids: z.array(z.string().min(1)).optional(),
});

export const GOOGLE_SYNC_LOG_QUERY = z.strictObject({
  personId: ID.optional(),
  before: MOMENT.optional(),
});

export const GOOGLE_CHOICE_BODY = z.strictObject({
  logId: ID,
  googleId: z.string().min(1),
});

export const GOOGLE_ENDPOINTS = {
  googleLinkStart: endpoint({
    method: 'POST',
    path: '/api/google/link/start',
    access: 'member',
    summary:
      'Start linking the caller’s Google account: the hub makes the PKCE verifier and state and returns the consent URL for the system browser',
    params: NOTHING,
    query: PERSON_QUERY,
    body: GOOGLE_LINK_START,
    response: GOOGLE_LINK_STARTED,
  }),
  googleLinkFinish: endpoint({
    method: 'POST',
    path: '/api/google/link/finish',
    access: 'member',
    summary:
      'Finish linking with the code the redirect carried; the hub exchanges it and keeps the refresh token in its secrets file',
    params: NOTHING,
    query: PERSON_QUERY,
    body: GOOGLE_LINK_FINISH,
    response: GOOGLE_ACCOUNT_ROW,
  }),
  googleUnlink: endpoint({
    method: 'DELETE',
    path: '/api/google/link',
    access: 'member',
    summary: 'Unlink the Google account and delete its stored tokens',
    params: NOTHING,
    query: PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  googleSync: endpoint({
    method: 'POST',
    path: '/api/google/sync',
    access: 'member',
    summary: 'Sync Google Calendar and Tasks now (sync now, pull to refresh, page visible)',
    params: NOTHING,
    query: PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  googleSyncLog: endpoint({
    method: 'GET',
    path: '/api/google/sync-log',
    access: 'member',
    summary:
      'The Google sync log, newest first, with counts, conflicts with the losing value, errors and open choices',
    params: NOTHING,
    query: GOOGLE_SYNC_LOG_QUERY,
    body: NO_BODY,
    response: z.array(GOOGLE_SYNC_LOG_ENTRY),
  }),
  googleApp: endpoint({
    method: 'PUT',
    path: '/api/google/app',
    access: 'owner',
    summary: 'Store the Google client ids and the Desktop client secret in the hub secrets file',
    params: NOTHING,
    query: NOTHING,
    body: GOOGLE_APP_BODY,
    response: DONE,
  }),
  googleAccount: endpoint({
    method: 'PATCH',
    path: '/api/google/account',
    access: 'member',
    summary: 'Choose which Google calendars and task lists sync',
    params: NOTHING,
    query: PERSON_QUERY,
    body: GOOGLE_ACCOUNT_PATCH,
    response: GOOGLE_ACCOUNT_ROW,
  }),
  googleChoice: endpoint({
    method: 'POST',
    path: '/api/google/choice',
    access: 'member',
    summary:
      'Resolve an uncertain Google Tasks insert that matched more than one task by choosing the one to keep',
    params: NOTHING,
    query: PERSON_QUERY,
    body: GOOGLE_CHOICE_BODY,
    response: GOOGLE_SYNC_LOG_ENTRY,
  }),
  googlePush: endpoint({
    method: 'POST',
    path: '/api/google/push/:channelId',
    access: 'public',
    summary:
      'Google push channel receiver: checks the channel token, then only queues an incremental sync',
    params: CHANNEL_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
