import {
  API_ENDPOINTS,
  EVENT_KINDS,
  isUrgent,
  type DeviceEvent,
  type PushStatus,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliveryOf, FCM_SCOPE } from '../../src/extensions/push/fcm';
import {
  MissingWordingError,
  notificationFor,
  URGENT_WORDING,
} from '../../src/extensions/push/messages';
import {
  bootServer,
  linkFakeProvider,
  pairPhone,
  verifiedPublicUrl,
  type Booted,
} from '../support/booted';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import {
  claimsOf,
  FakeGoogle,
  headerOf,
  SEND_URL,
  SERVICE_ACCOUNT,
  TOKEN_URI,
} from './fake-google';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let google: FakeGoogle;
let logs: CapturedLogs;

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

beforeEach(async () => {
  logs = captureLogs();
  directory = await temporaryDirectory();
  google = new FakeGoogle();
  booted = await bootServer(directory.path, {
    fetch: (input, init) => {
      const url = urlOf(input);
      if (google.handles(url)) {
        return Promise.resolve(google.respond(url, init));
      }
      const target = new URL(url);
      return target.origin === 'https://home.example.com'
        ? fetch(`${booted.base}${target.pathname}`, init)
        : Promise.reject(new Error(`unexpected request to ${url}`));
    },
  });
  await linkFakeProvider(booted);
  await verifiedPublicUrl(booted);
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function saveAccount(): Promise<void> {
  const saved = await call(booted.base, booted.owner, {
    method: 'PUT',
    path: '/api/settings/push',
    body: { serviceAccount: SERVICE_ACCOUNT },
  });
  expect(saved.status).toBe(200);
}

async function registerPhone(token: string): Promise<string> {
  const phone = await pairPhone(booted);
  const saved = await call(booted.base, phone.token, {
    method: 'PUT',
    path: '/api/push-targets',
    body: { token, platform: 'android' },
  });
  expect(saved.status).toBe(200);
  return phone.clientId;
}

function happen(event: Partial<DeviceEvent>): void {
  booted.fake.adapter.sink?.event({
    externalId: 'camera-1',
    kind: 'doorbell',
    occurredAt: new Date().toISOString(),
    details: {},
    ...event,
  });
}

async function status(): Promise<PushStatus> {
  const reply = await call(booted.base, booted.owner, {
    method: 'GET',
    path: API_ENDPOINTS.readPushStatus.path,
  });
  expect(reply.status).toBe(200);
  return API_ENDPOINTS.readPushStatus.response.parse(reply.body);
}

async function targets(): Promise<readonly string[]> {
  const reply = await call(booted.base, booted.owner, { method: 'GET', path: '/api/push-targets' });
  const rows = Array.isArray(reply.body) ? reply.body : [];
  return rows.map((row) => /"token":"([^"]+)"/.exec(JSON.stringify(row))?.[1] ?? '');
}

describe('push notifications', () => {
  it('sends an urgent event to every phone through FCM with one cached access token', async () => {
    await saveAccount();
    await registerPhone('fcm-a');
    await registerPhone('fcm-b');
    happen({});
    await vi.waitFor(() => {
      expect(google.sent).toHaveLength(2);
    });
    happen({ kind: 'smoke' });
    await vi.waitFor(() => {
      expect(google.sent).toHaveLength(4);
    });
    expect(google.assertions).toHaveLength(1);
    const assertion = google.assertions[0] ?? '';
    expect(headerOf(assertion)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = claimsOf(assertion);
    expect(claims).toMatchObject({
      iss: SERVICE_ACCOUNT.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URI,
    });
    expect(FCM_SCOPE).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(google.sent.map((sent) => sent.authorization)).toEqual([
      'Bearer ya29.1',
      'Bearer ya29.1',
      'Bearer ya29.1',
      'Bearer ya29.1',
    ]);
    const first = JSON.stringify(google.sent[0]?.body);
    expect(JSON.parse(first.replace(/"(eventId|deviceId)":"[0-9a-f-]{36}"/g, '"$1":"ID"'))).toEqual(
      {
        message: {
          token: 'fcm-a',
          notification: { title: 'Doorbell', body: 'Someone is at the door (Front door in Home)' },
          data: { eventId: 'ID', kind: 'doorbell', deviceId: 'ID' },
          android: { priority: 'HIGH', notification: { sound: 'default' } },
        },
      },
    );
    expect(JSON.stringify(google.sent[2]?.body)).toContain('Front door in Home detected smoke');
    await vi.waitFor(async () => {
      expect(await status()).toMatchObject({ sent: 4, failed: 0, removed: 0, lastError: null });
    });
    expect(SEND_URL).toContain('/projects/home-push/');
  });

  it('forgets the tokens FCM no longer knows and keeps the failure reasons in the status', async () => {
    await saveAccount();
    await registerPhone('fcm-gone');
    await registerPhone('fcm-invalid');
    await registerPhone('fcm-busy');
    await registerPhone('fcm-good');
    google.answer = (token): ReturnType<FakeGoogle['answer']> => {
      switch (token) {
        case 'fcm-gone':
          return {
            status: 404,
            body: {
              error: {
                code: 404,
                message: 'Requested entity was not found.',
                status: 'NOT_FOUND',
                details: [
                  {
                    '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                    errorCode: 'UNREGISTERED',
                  },
                ],
              },
            },
          };
        case 'fcm-invalid':
          return {
            status: 400,
            body: {
              error: {
                code: 400,
                message: 'The registration token is not a valid FCM registration token',
                status: 'INVALID_ARGUMENT',
              },
            },
          };
        case 'fcm-busy':
          return {
            status: 503,
            body: { error: { code: 503, message: 'Busy', status: 'UNAVAILABLE' } },
          };
        default:
          return { status: 200, body: { name: 'm' } };
      }
    };
    happen({});
    await vi.waitFor(async () => {
      expect(await status()).toMatchObject({ sent: 1, failed: 1, removed: 2 });
    });
    expect(await targets()).toEqual(['fcm-busy', 'fcm-good']);
    expect((await status()).lastError).toBe(
      'HTTP 404 UNREGISTERED: Requested entity was not found.; HTTP 400 INVALID_ARGUMENT: The registration token is not a valid FCM registration token; HTTP 503 UNAVAILABLE: Busy',
    );
    expect(logs.events()).toEqual(
      expect.arrayContaining(['push.target_removed', 'push.not_delivered']),
    );
  });

  it('fetches a new access token once when FCM refuses the cached one', async () => {
    await saveAccount();
    await registerPhone('fcm-a');
    let refusals = 1;
    google.answer = (): ReturnType<FakeGoogle['answer']> => {
      if (refusals > 0) {
        refusals -= 1;
        return {
          status: 401,
          body: { error: { code: 401, message: 'expired', status: 'UNAUTHENTICATED' } },
        };
      }
      return { status: 200, body: { name: 'm' } };
    };
    happen({});
    await vi.waitFor(async () => {
      expect((await status()).sent).toBe(1);
    });
    expect(google.assertions).toHaveLength(2);
    expect(google.sent.map((sent) => sent.authorization)).toEqual([
      'Bearer ya29.1',
      'Bearer ya29.2',
    ]);
  });

  it('records why nothing was sent when Google refuses the service account', async () => {
    await saveAccount();
    await registerPhone('fcm-a');
    google.tokenStatus = 401;
    happen({});
    await vi.waitFor(async () => {
      expect((await status()).failed).toBe(1);
    });
    expect((await status()).lastError).toMatch(
      /^PushAuthorizationError: Google refused the Firebase service account: HTTP 401/,
    );
    expect(google.sent).toEqual([]);
  });

  it('says that push is not configured when no service account is saved', async () => {
    await registerPhone('fcm-a');
    happen({});
    await vi.waitFor(async () => {
      expect((await status()).lastError).toBe('no Firebase service account is saved');
    });
    expect(google.assertions).toEqual([]);
    expect(logs.events()).toContain('push.not_configured');
  });

  it('pushes nothing for events that are not urgent, or when no phone is registered', async () => {
    await saveAccount();
    happen({});
    await vi.waitFor(() => {
      expect(logs.events()).toContain('push.no_targets');
    });
    await registerPhone('fcm-a');
    happen({ kind: 'motion' });
    happen({ kind: 'leak' });
    await vi.waitFor(() => {
      expect(google.sent).toHaveLength(1);
    });
    expect(JSON.stringify(google.sent[0]?.body)).toContain('"kind":"leak"');
  });

  it('shows the push status to owners only', async () => {
    const phone = await pairPhone(booted, 'member');
    const refused = await call(booted.base, phone.token, {
      method: 'GET',
      path: API_ENDPOINTS.readPushStatus.path,
    });
    expect(refused.status).toBe(403);
    expect(await status()).toEqual({
      lastAttemptAt: null,
      lastSentAt: null,
      lastError: null,
      sent: 0,
      failed: 0,
      removed: 0,
    });
  });
});

describe('notification wording', () => {
  const event = {
    id: 'e',
    homeName: 'Home',
    deviceId: 'd',
    deviceName: 'Front door',
    message: null,
    automationName: null,
  } as const;

  it('has wording for every urgent event kind', () => {
    for (const kind of EVENT_KINDS.filter(isUrgent)) {
      expect(typeof URGENT_WORDING[kind]?.title).toBe('string');
    }
  });

  it('names the device and its home, or the home alone', () => {
    expect(notificationFor({ ...event, kind: 'call' })).toEqual({
      title: 'Incoming call',
      body: 'Front door in Home is calling',
    });
    expect(notificationFor({ ...event, kind: 'alarm', deviceId: null, deviceName: null })).toEqual({
      title: 'Alarm',
      body: 'Home raised an alarm',
    });
    expect(notificationFor({ ...event, kind: 'leak' }).body).toBe(
      'Front door in Home detected water',
    );
  });

  it('pushes an automation message as written, titled by its automation', () => {
    expect(
      notificationFor({
        ...event,
        kind: 'automation_run',
        message: 'Leaking',
        automationName: 'Leak watch',
      }),
    ).toEqual({ title: 'Leak watch', body: 'Leaking' });
    expect(notificationFor({ ...event, kind: 'automation_run', message: 'Bedtime' })).toEqual({
      title: 'Home',
      body: 'Bedtime',
    });
  });

  it('refuses a kind without wording', () => {
    expect(() => notificationFor({ ...event, kind: 'motion' })).toThrow(MissingWordingError);
  });
});

describe('reading FCM errors', () => {
  it('treats a token named in a field violation as stale and anything unreadable as a failure', () => {
    expect(
      deliveryOf(
        400,
        JSON.stringify({
          error: {
            message: 'Invalid value',
            status: 'INVALID_ARGUMENT',
            details: [{ fieldViolations: [{ field: 'message.token' }] }],
          },
        }),
      ),
    ).toEqual({ outcome: 'stale', reason: 'HTTP 400 INVALID_ARGUMENT: Invalid value' });
    expect(
      deliveryOf(
        400,
        JSON.stringify({
          error: {
            message: 'Invalid value',
            status: 'INVALID_ARGUMENT',
            details: [{ fieldViolations: [{ field: 'message.data' }] }],
          },
        }),
      ),
    ).toEqual({ outcome: 'failed', reason: 'HTTP 400 INVALID_ARGUMENT: Invalid value' });
    expect(deliveryOf(502, '<html>')).toEqual({ outcome: 'failed', reason: 'HTTP 502 <html>' });
  });
});
