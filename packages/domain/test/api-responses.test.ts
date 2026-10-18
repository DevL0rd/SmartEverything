import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { DEFAULT_HISTORY_SETTINGS } from '../src/history-settings';
import {
  API_ENDPOINTS,
  HISTORY_BUCKET,
  MCP_APPROVAL_CODE,
  MEDIA_LINK,
  PAIRING,
  PUBLIC_STATUS,
  PUBLIC_URL_CHECK,
  SESSION,
  SESSION_DESCRIPTION,
} from '../src';
import { CAMERA_SERVICE_STATES, ISSUED_TOKEN } from '../src/api/endpoints-access';
import { STORED_LAYOUT } from '../src/api/endpoints-automation';
import { BEST_DAY, HEALTH_SIGHTING } from '../src/api/endpoints-health';
import { RECORDING_LINK } from '../src/api/endpoints-media';
import { PUSH_STATUS } from '../src/api/endpoints-settings';

const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';
const AT = '2026-10-08T07:00:00Z';
const TOKEN = `set_${'ab'.repeat(32)}`;

const HUB = { version: '1.4.0', startedAt: AT, cameras: 'running' };

const CLIENT = {
  id: FIRST,
  name: 'Pixel 9',
  platform: 'android',
  role: 'member',
  built_in: false,
  profile_id: null,
  created_at: AT,
  last_seen_at: null,
};

const SETTINGS = {
  home_name: 'Our Home',
  time_zone: 'Europe/London',
  latitude: null,
  longitude: null,
  location_name: null,
  max_heart_rate: null,
  fitness_goals: {
    steps: null,
    move_kcal: null,
    active_minutes: null,
    sleep_minutes: null,
    hydration_ml: null,
  },
  mcp_disabled_tools: [],
  history_settings: DEFAULT_HISTORY_SETTINGS,
  end_of_speech_pause_ms: 200,
  ear_host_device_id: null,
  device_refills: {},
  ir_remotes: {},
  public_url: 'https://home.example.com',
  public_url_checked_at: AT,
  public_url_verified_at: null,
  public_url_error: null,
  ice_servers: [],
  webrtc_candidates: [],
  push_project_id: null,
  updated_at: AT,
};

const HEALTH_SOURCE = {
  client_id: SECOND,
  name: 'Pixel 9',
  granted_types: ['Steps'],
  last_sync_at: null,
  last_error: null,
  created_at: AT,
};

const MCP_TOKEN = {
  id: FIRST,
  name: 'Laptop',
  created_at: AT,
  last_used_at: null,
  revoked_at: null,
};

function expectKept(schema: z.ZodType, value: unknown): void {
  expect(schema.parse(value)).toStrictEqual(value);
}

function expectRefused(schema: z.ZodType, values: readonly unknown[]): void {
  for (const value of values) {
    expect(schema.safeParse(value).success).toBe(false);
  }
}

describe('access responses', () => {
  it('PUBLIC_STATUS reports the service, version, uptime and public URL state', () => {
    const status = {
      service: 'smarteverything',
      version: '1.4.0',
      uptimeSeconds: 0,
      publicUrl: { configured: true, verified: false },
    };
    expectKept(PUBLIC_STATUS, status);
    expectKept(API_ENDPOINTS.status.response, { ...status, uptimeSeconds: 12 });
    expectRefused(PUBLIC_STATUS, [
      { ...status, service: 'other' },
      { ...status, version: '' },
      { ...status, uptimeSeconds: -1 },
      { ...status, uptimeSeconds: 1.5 },
      { ...status, publicUrl: { configured: true } },
      { ...status, publicUrl: { configured: true, verified: false, at: AT } },
      { ...status, extra: 1 },
    ]);
  });

  it('SESSION reports the calling client and the hub', () => {
    expect(CAMERA_SERVICE_STATES).toStrictEqual(['running', 'stopped']);
    expectKept(SESSION, { client: CLIENT, hub: HUB });
    expectKept(API_ENDPOINTS.session.response, {
      client: CLIENT,
      hub: { ...HUB, cameras: 'stopped' },
    });
    expectRefused(SESSION, [{ client: CLIENT }, { client: CLIENT, hub: HUB, extra: 1 }]);
  });

  it('PAIRING reports the code, its expiry and the QR payload', () => {
    const pairing = {
      code: 'ABCD-2345',
      expiresAt: AT,
      qr: {
        url: 'https://home.example.com',
        code: 'ABCD-2345',
        identity: {
          id: 'ab'.repeat(32),
          protocolVersion: 1,
          name: 'Home',
          tls: {
            serverName: `smarteverything-${'ab'.repeat(16)}.local`,
            certificateSha256: 'cd'.repeat(32),
            publicKeySha256: 'ab'.repeat(32),
          },
        },
        endpoints: [{ kind: 'remote', url: 'https://home.example.com' }],
      },
    };
    expectKept(PAIRING, pairing);
    expectKept(API_ENDPOINTS.startPairing.response, pairing);
    expectRefused(PAIRING, [
      { ...pairing, code: 'abcd' },
      { ...pairing, expiresAt: 'soon' },
      { ...pairing, extra: 1 },
    ]);
  });

  it('claimPairing returns the issued token with the new client', () => {
    expectKept(API_ENDPOINTS.claimPairing.response, { token: TOKEN, client: CLIENT });
    expectRefused(API_ENDPOINTS.claimPairing.response, [
      { token: TOKEN },
      { token: '', client: CLIENT },
    ]);
  });

  it('ISSUED_TOKEN carries a non-empty token only', () => {
    expectKept(ISSUED_TOKEN, { token: TOKEN });
    expectKept(API_ENDPOINTS.rotateOwnerToken.response, { token: 'ab' });
    expectRefused(ISSUED_TOKEN, [{ token: '' }, { token: TOKEN, extra: 1 }]);
  });
});

describe('settings responses', () => {
  it('PUBLIC_URL_CHECK reports a verified URL with the settings', () => {
    expectKept(PUBLIC_URL_CHECK, { outcome: 'verified', settings: SETTINGS });
    expectKept(API_ENDPOINTS.verifyPublicUrl.response, { outcome: 'verified', settings: SETTINGS });
  });

  it('PUBLIC_URL_CHECK reports a failed check with its reason and the settings', () => {
    const failed = { outcome: 'failed', reason: 'timed out', settings: SETTINGS };
    expectKept(PUBLIC_URL_CHECK, failed);
    expectRefused(PUBLIC_URL_CHECK, [
      { ...failed, reason: '' },
      { outcome: 'failed', settings: SETTINGS },
      { outcome: 'verified', reason: 'x', settings: SETTINGS },
      { outcome: 'pending', settings: SETTINGS },
    ]);
  });

  it('PUSH_STATUS counts deliveries and keeps the last attempt, success and failure', () => {
    const status = {
      lastAttemptAt: AT,
      lastSentAt: null,
      lastError: 'no Firebase service account is saved',
      sent: 0,
      failed: 2,
      removed: 1,
    };
    expectKept(PUSH_STATUS, status);
    expectKept(API_ENDPOINTS.readPushStatus.response, {
      ...status,
      lastAttemptAt: null,
      lastSentAt: AT,
      lastError: null,
    });
    expectRefused(PUSH_STATUS, [
      { ...status, sent: -1 },
      { ...status, failed: 1.5 },
      { ...status, removed: -1 },
      { ...status, lastAttemptAt: 'now' },
      { ...status, lastSentAt: 'now' },
      { ...status, extra: 1 },
    ]);
  });

  it('the SmartThings app status reports the client, public URLs and webhook state', () => {
    const webhook = { confirmedAt: AT, lastEventAt: null, lastError: 'refused' };
    const status = {
      app: { appId: 'app', clientId: 'client' },
      publicUrl: 'verified',
      redirectUri: 'https://home.example.com/smartthings/callback',
      webhookUrl: 'https://home.example.com/smartthings/webhook',
      webhook,
    };
    const none = {
      app: null,
      publicUrl: 'missing',
      redirectUri: null,
      webhookUrl: null,
      webhook: { confirmedAt: null, lastEventAt: AT, lastError: null },
    };
    const schema = API_ENDPOINTS.readSmartThingsApp.response;
    expectKept(schema, status);
    expectKept(schema, none);
    expectKept(schema, { ...status, app: { appId: null, clientId: 'client' } });
    expectRefused(schema, [
      { ...status, publicUrl: 'unknown' },
      { ...status, redirectUri: 'callback' },
      { ...status, webhookUrl: 'webhook' },
      { ...status, webhook: { ...webhook, confirmedAt: 'now' } },
      { ...status, webhook: { ...webhook, lastEventAt: 'now' } },
      { ...status, webhook: { ...webhook, extra: 1 } },
      { ...status, extra: 1 },
    ]);
  });

  it('the SmartThings setup outcome carries what each result needs', () => {
    const schema = API_ENDPOINTS.setUpSmartThings.response;
    const status = {
      app: { appId: 'app', clientId: 'client' },
      publicUrl: 'verified',
      redirectUri: null,
      webhookUrl: null,
      webhook: { confirmedAt: null, lastEventAt: null, lastError: null },
    };
    const authorization = { url: 'https://api.smartthings.com/oauth/authorize', expiresAt: AT };
    expectKept(schema, { outcome: 'ready', authorization, status });
    expectKept(schema, { outcome: 'token_refused', reason: 'bad token' });
    expectKept(schema, { outcome: 'scopes_missing', missing: ['r:apps:*'], reason: 'scopes' });
    expectKept(schema, { outcome: 'rate_limited', retryAfterSeconds: null, reason: 'slow down' });
    expectKept(schema, { outcome: 'not_confirmed', reason: 'no ping', status });
    expectRefused(schema, [
      { outcome: 'ready', status },
      { outcome: 'token_refused', reason: '' },
      { outcome: 'scopes_missing', missing: [], reason: 'scopes' },
      { outcome: 'scopes_missing', missing: ['x:y'], reason: 'scopes' },
      { outcome: 'rate_limited', retryAfterSeconds: -1, reason: 'slow down' },
      { outcome: 'other' },
    ]);
  });

  it('the SmartThings authorization carries the sign-in URL and when its state expires', () => {
    const authorization = { url: 'https://api.smartthings.com/oauth/authorize?x=1', expiresAt: AT };
    const schema = API_ENDPOINTS.authorizeSmartThings.response;
    expectKept(schema, authorization);
    expectRefused(schema, [
      { ...authorization, url: 'sign in' },
      { ...authorization, expiresAt: 'soon' },
      { ...authorization, extra: 1 },
    ]);
  });
});

describe('device and media responses', () => {
  it('HISTORY_BUCKET reports a counted bucket with optional statistics', () => {
    const bucket = {
      device_id: FIRST,
      capability: 'temperature',
      bucket_start: AT,
      count: 3,
      average: 20.5,
      minimum: 19,
      maximum: 22,
      last: 21,
    };
    expectKept(HISTORY_BUCKET, bucket);
    expectKept(HISTORY_BUCKET, {
      ...bucket,
      count: 1,
      average: null,
      minimum: null,
      maximum: null,
      last: 'on',
    });
    expectRefused(HISTORY_BUCKET, [
      { ...bucket, count: 0 },
      { ...bucket, count: 1.5 },
      { ...bucket, capability: '' },
      { ...bucket, extra: 1 },
    ]);
  });

  it('SESSION_DESCRIPTION carries an SDP of one to 200,000 characters', () => {
    expectKept(SESSION_DESCRIPTION, { sdp: 'v=0' });
    expectKept(API_ENDPOINTS.offerCamera.response, { sdp: 'v'.repeat(200_000) });
    expectRefused(SESSION_DESCRIPTION, [
      { sdp: '' },
      { sdp: 'v'.repeat(200_001) },
      { sdp: 'v', x: 1 },
    ]);
  });

  it('MEDIA_LINK carries a path under /media/ and its expiry', () => {
    const link = { url: '/media/cameras/c1/mse?expires=1&signature=ab', expiresAt: AT };
    expectKept(MEDIA_LINK, link);
    expectKept(API_ENDPOINTS.cameraStream.response, { url: '/media/', expiresAt: AT });
    expectKept(API_ENDPOINTS.cameraSnapshot.response, link);
    expectRefused(MEDIA_LINK, [
      { ...link, url: '/api/cameras' },
      { ...link, url: 'https://x.example/media/' },
      { ...link, url: '/x/media/' },
      { ...link, expiresAt: 'soon' },
      { ...link, extra: 1 },
    ]);
  });

  it('RECORDING_LINK carries the recording id with its media link', () => {
    const link = { url: '/media/recordings/r1', expiresAt: AT, id: FIRST };
    expectKept(RECORDING_LINK, link);
    expectKept(API_ENDPOINTS.recordingLinks.response, [link, { ...link, id: SECOND }]);
    expectRefused(RECORDING_LINK, [
      { ...link, id: 'r1' },
      { url: link.url, expiresAt: AT },
    ]);
  });
});

describe('client and health responses', () => {
  it('STORED_LAYOUT carries the saved layout or null', () => {
    expectKept(STORED_LAYOUT, { layout: { tiles: ['a'] } });
    expectKept(API_ENDPOINTS.readLayout.response, { layout: null });
    expectRefused(STORED_LAYOUT, [{}, { layout: [] }, { layout: null, extra: 1 }]);
  });

  it('BEST_DAY carries the best day and its figure, or null when there is none', () => {
    expectKept(BEST_DAY, { day: '2026-10-08', value: 12_000 });
    expectKept(API_ENDPOINTS.readBestDay.response, null);
    expectRefused(BEST_DAY, [
      { day: AT, value: 1 },
      { day: '2026-10-08' },
      { day: '2026-10-08', value: 1, extra: 1 },
    ]);
  });

  it('HEALTH_SIGHTING names the app and the record type it wrote', () => {
    expectKept(HEALTH_SIGHTING, { sourceApp: 'com.mi.health', recordType: 'Steps' });
    expectKept(API_ENDPOINTS.readHealthSightings.response, [
      { sourceApp: 'ab', recordType: 'HeartRate' },
    ]);
    expectRefused(HEALTH_SIGHTING, [
      { sourceApp: '', recordType: 'Steps' },
      { sourceApp: 'com.mi.health', recordType: 'Mood' },
      { sourceApp: 'com.mi.health', recordType: 'Steps', extra: 1 },
    ]);
  });

  it('createHealthSource returns the phone’s sync status row and no token', () => {
    expectKept(API_ENDPOINTS.createHealthSource.response, HEALTH_SOURCE);
    expectRefused(API_ENDPOINTS.createHealthSource.response, [
      { token: 'hst_x', source: HEALTH_SOURCE },
    ]);
  });

  it('createMcpToken returns the token with its row', () => {
    expectKept(API_ENDPOINTS.createMcpToken.response, { token: 'mcp_x', row: MCP_TOKEN });
    expectRefused(API_ENDPOINTS.createMcpToken.response, [{ token: 'mcp_x' }]);
  });
});

describe('assistant responses', () => {
  it('MCP_APPROVAL_CODE is six digits with the moment it stops working, at any offset', () => {
    const code = { code: '012345', expiresAt: AT };
    expectKept(MCP_APPROVAL_CODE, code);
    expectKept(API_ENDPOINTS.createApprovalCode.response, {
      code: '999999',
      expiresAt: '2026-10-09T17:00:00.000+07:00',
    });
    expectRefused(MCP_APPROVAL_CODE, [
      ...['12345', '1234567', '12a456', ' 123456', '123456 '].map((digits) => ({
        ...code,
        code: digits,
      })),
      { ...code, expiresAt: 'tomorrow' },
      { ...code, extra: true },
    ]);
  });
});
