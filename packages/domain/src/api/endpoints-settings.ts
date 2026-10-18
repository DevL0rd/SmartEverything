import { z } from 'zod';
import { PROVIDER } from '../devices';
import { PROVIDER_CREDENTIALS } from '../hub-commands';
import { PLACE_NAME } from '../places';
import { TIME_ZONE } from '../automations';
import { FITNESS_SETTINGS_CHANGE } from '../fitness-settings';
import { HISTORY_SETTINGS_CHANGE } from '../history-settings';
import { PAUSE_MS } from '../voice-activity';
import { PROVIDER_LINK_ROW, HOME_NAME, LATITUDE, LONGITUDE, SETTINGS_ROW } from './rows-home';
import { NO_BODY, endpoint } from './endpoint';
import { SMARTTHINGS_ENDPOINTS } from './endpoints-smartthings';
import {
  COUNT,
  DONE,
  HTTPS_URL,
  ICE_SERVER,
  ID,
  MOMENT,
  NOTHING,
  WEBRTC_CANDIDATE,
  somethingToChange,
} from './primitives';

export const PUBLIC_URL_CHECK = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('verified'), settings: SETTINGS_ROW }),
  z.strictObject({
    outcome: z.literal('failed'),
    reason: z.string().min(1),
    settings: SETTINGS_ROW,
  }),
]);

export type PublicUrlCheck = z.infer<typeof PUBLIC_URL_CHECK>;

export const PUSH_SERVICE_ACCOUNT = z.object({
  type: z.literal('service_account'),
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
  token_uri: z.url({ protocol: /^https$/ }),
});

export type PushServiceAccount = z.infer<typeof PUSH_SERVICE_ACCOUNT>;

const PROVIDER_ANSWER = z.strictObject({ provider: PROVIDER, answer: z.string().min(1) });

const PROVIDER_CANCEL = z.strictObject({ provider: PROVIDER });

export const PUSH_STATUS = z.strictObject({
  lastAttemptAt: MOMENT.nullable(),
  lastSentAt: MOMENT.nullable(),
  lastError: z.string().nullable(),
  sent: COUNT,
  failed: COUNT,
  removed: COUNT,
});

export type PushStatus = z.infer<typeof PUSH_STATUS>;

const SETTINGS_ENDPOINTS = {
  readSettings: endpoint({
    method: 'GET',
    path: '/api/settings',
    access: 'member',
    summary: 'The home, remote access and push settings, without secrets',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: SETTINGS_ROW,
  }),
  updateHome: endpoint({
    method: 'PATCH',
    path: '/api/settings/home',
    access: 'owner',
    summary: 'Rename the home or change its time zone and location',
    params: NOTHING,
    query: NOTHING,
    body: somethingToChange({
      home_name: HOME_NAME,
      time_zone: TIME_ZONE,
      latitude: LATITUDE.nullable(),
      longitude: LONGITUDE.nullable(),
      location_name: PLACE_NAME.nullable(),
    }),
    response: SETTINGS_ROW,
  }),
  updateNetwork: endpoint({
    method: 'PATCH',
    path: '/api/settings/network',
    access: 'owner',
    summary: 'The ICE servers and WebRTC candidates cameras offer away from home',
    params: NOTHING,
    query: NOTHING,
    body: somethingToChange({
      ice_servers: z.array(ICE_SERVER),
      webrtc_candidates: z.array(WEBRTC_CANDIDATE),
    }),
    response: SETTINGS_ROW,
  }),
  updateFitnessSettings: endpoint({
    method: 'PATCH',
    path: '/api/settings/fitness',
    access: 'member',
    summary: 'Change the goals or maximum heart rate of the caller’s profile; null clears one',
    params: NOTHING,
    query: NOTHING,
    body: FITNESS_SETTINGS_CHANGE,
    response: SETTINGS_ROW,
  }),
  updateHistorySettings: endpoint({
    method: 'PATCH',
    path: '/api/settings/history',
    access: 'owner',
    summary:
      'Change how often readings are recorded and how long they are kept, for a kind of source or one device; null removes a device override',
    params: NOTHING,
    query: NOTHING,
    body: HISTORY_SETTINGS_CHANGE,
    response: SETTINGS_ROW,
  }),
  updateListeningSettings: endpoint({
    method: 'PATCH',
    path: '/api/settings/listening',
    access: 'owner',
    summary:
      'Change the end-of-speech pause (how long the shared speech gate waits after someone stops talking, for calls and every listening ear) or the computer that listens on behalf of cameras, walkie channels and Discord (null picks the first online computer that can)',
    params: NOTHING,
    query: NOTHING,
    body: somethingToChange({
      end_of_speech_pause_ms: PAUSE_MS,
      ear_host_device_id: ID.nullable(),
    }),
    response: SETTINGS_ROW,
  }),
  setPublicUrl: endpoint({
    method: 'PUT',
    path: '/api/settings/public-url',
    access: 'owner',
    summary: 'Save the public HTTPS URL; it stays unverified until verified',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ url: HTTPS_URL.nullable() }),
    response: SETTINGS_ROW,
  }),
  verifyPublicUrl: endpoint({
    method: 'POST',
    path: '/api/settings/public-url/verify',
    access: 'owner',
    summary: 'Fetch a fresh nonce from this server through the public URL',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PUBLIC_URL_CHECK,
  }),
  setPushAccount: endpoint({
    method: 'PUT',
    path: '/api/settings/push',
    access: 'owner',
    summary: 'Store the Firebase service account used to send push notifications',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ serviceAccount: PUSH_SERVICE_ACCOUNT }),
    response: SETTINGS_ROW,
  }),
  clearPushAccount: endpoint({
    method: 'DELETE',
    path: '/api/settings/push',
    access: 'owner',
    summary: 'Forget the Firebase service account',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: SETTINGS_ROW,
  }),
  readPushStatus: endpoint({
    method: 'GET',
    path: '/api/settings/push/status',
    access: 'owner',
    summary: 'Push deliveries so far and the last failure reason',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PUSH_STATUS,
  }),
  listProviders: endpoint({
    method: 'GET',
    path: '/api/providers',
    access: 'member',
    summary: 'Every provider link, its status, prompt and last error',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PROVIDER_LINK_ROW),
  }),
  linkProvider: endpoint({
    method: 'POST',
    path: '/api/providers/link',
    access: 'owner',
    summary: 'Start signing in to a provider with these credentials; progress is on its link row',
    params: NOTHING,
    query: NOTHING,
    body: PROVIDER_CREDENTIALS,
    response: DONE,
  }),
  answerProviderPrompt: endpoint({
    method: 'POST',
    path: '/api/providers/answer',
    access: 'owner',
    summary: 'Answer the question a provider sign-in is waiting on',
    params: NOTHING,
    query: NOTHING,
    body: PROVIDER_ANSWER,
    response: DONE,
  }),
  cancelProviderLink: endpoint({
    method: 'POST',
    path: '/api/providers/cancel',
    access: 'owner',
    summary: 'Stop a sign-in in progress; a stored account stays linked',
    params: NOTHING,
    query: NOTHING,
    body: PROVIDER_CANCEL,
    response: DONE,
  }),
} as const;

export const SETTINGS_AREA_ENDPOINTS = { ...SETTINGS_ENDPOINTS, ...SMARTTHINGS_ENDPOINTS } as const;
