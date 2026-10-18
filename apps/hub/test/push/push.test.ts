import { API_ENDPOINTS, EVENT_KINDS, isUrgent } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { deliveryOf, FCM_SCOPE } from '../../src/extensions/push/fcm';
import {
  MissingWordingError,
  notificationFor,
  URGENT_WORDING,
} from '../../src/extensions/push/messages';
import { pairPhone } from '../support/booted';
import { call } from '../support/server';
import {
  claimsOf,
  headerOf,
  SEND_URL,
  SERVICE_ACCOUNT,
  TOKEN_URI,
  type FakeGoogle,
} from './fake-google';
import { usePushBench } from './push-bench';

describe('push notifications', () => {
  const bench = usePushBench();

  it('sends an urgent event to every phone through FCM with one cached access token', async () => {
    await bench.saveAccount();
    await bench.registerPhone('fcm-a');
    await bench.registerPhone('fcm-b');
    bench.happen({});
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(2);
    });
    bench.happen({ kind: 'smoke' });
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(4);
    });
    expect(bench.google.assertions).toHaveLength(1);
    const assertion = bench.google.assertions[0] ?? '';
    expect(headerOf(assertion)).toEqual({ alg: 'RS256' });
    const claims = claimsOf(assertion);
    expect(claims).toMatchObject({
      iss: SERVICE_ACCOUNT.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URI,
    });
    expect(FCM_SCOPE).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(bench.google.sent.map((sent) => sent.authorization)).toEqual([
      'Bearer ya29.1',
      'Bearer ya29.1',
      'Bearer ya29.1',
      'Bearer ya29.1',
    ]);
    const first = JSON.stringify(bench.google.sent[0]?.body);
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
    expect(JSON.stringify(bench.google.sent[2]?.body)).toContain(
      'Front door in Home detected smoke',
    );
    await vi.waitFor(async () => {
      expect(await bench.status()).toMatchObject({
        sent: 4,
        failed: 0,
        removed: 0,
        lastError: null,
      });
    });
    expect(SEND_URL).toContain('/projects/home-push/');
  });

  it('forgets the tokens FCM no longer knows and keeps the failure reasons in the status', async () => {
    await bench.saveAccount();
    await bench.registerPhone('fcm-gone');
    await bench.registerPhone('fcm-invalid');
    await bench.registerPhone('fcm-busy');
    await bench.registerPhone('fcm-good');
    bench.google.answer = (token): ReturnType<FakeGoogle['answer']> => {
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
                    '@type': 'type.googleapis.com/bench.google.firebase.fcm.v1.FcmError',
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
    bench.happen({});
    await vi.waitFor(async () => {
      expect(await bench.status()).toMatchObject({ sent: 1, failed: 1, removed: 2 });
    });
    expect(await bench.targets()).toEqual(['fcm-busy', 'fcm-good']);
    expect((await bench.status()).lastError).toBe(
      'HTTP 404 UNREGISTERED: Requested entity was not found.; HTTP 400 INVALID_ARGUMENT: The registration token is not a valid FCM registration token; HTTP 503 UNAVAILABLE: Busy',
    );
    expect(bench.logs.events()).toEqual(
      expect.arrayContaining(['push.target_removed', 'push.not_delivered']),
    );
  });

  it('fetches a new access token once when FCM refuses the cached one', async () => {
    await bench.saveAccount();
    await bench.registerPhone('fcm-a');
    let refusals = 1;
    bench.google.answer = (): ReturnType<FakeGoogle['answer']> => {
      if (refusals > 0) {
        refusals -= 1;
        return {
          status: 401,
          body: { error: { code: 401, message: 'expired', status: 'UNAUTHENTICATED' } },
        };
      }
      return { status: 200, body: { name: 'm' } };
    };
    bench.happen({});
    await vi.waitFor(async () => {
      expect((await bench.status()).sent).toBe(1);
    });
    expect(bench.google.assertions).toHaveLength(2);
    expect(bench.google.sent.map((sent) => sent.authorization)).toEqual([
      'Bearer ya29.1',
      'Bearer ya29.2',
    ]);
  });

  it('records why nothing was sent when Google refuses the service account', async () => {
    await bench.saveAccount();
    await bench.registerPhone('fcm-a');
    bench.google.tokenStatus = 401;
    bench.happen({});
    await vi.waitFor(async () => {
      expect((await bench.status()).failed).toBe(1);
    });
    expect((await bench.status()).lastError).toMatch(
      /^PushAuthorizationError: Google refused the Firebase service account: invalid_grant: Invalid JWT Signature\./,
    );
    expect(bench.google.sent).toEqual([]);
  });

  it('says that push is not configured when no service account is saved', async () => {
    await bench.registerPhone('fcm-a');
    bench.happen({});
    await vi.waitFor(async () => {
      expect((await bench.status()).lastError).toBe('no Firebase service account is saved');
    });
    expect(bench.google.assertions).toEqual([]);
    expect(bench.logs.events()).toContain('push.not_configured');
  });

  it('pushes nothing for events that are not urgent, or when no phone is registered', async () => {
    await bench.saveAccount();
    bench.happen({});
    await vi.waitFor(() => {
      expect(bench.logs.events()).toContain('push.no_targets');
    });
    await bench.registerPhone('fcm-a');
    bench.happen({ kind: 'motion' });
    bench.happen({ kind: 'leak' });
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    expect(JSON.stringify(bench.google.sent[0]?.body)).toContain('"kind":"leak"');
  });

  it('shows the push status to owners only', async () => {
    const phone = await pairPhone(bench.booted, 'member');
    const refused = await call(bench.booted.base, phone.token, {
      method: 'GET',
      path: API_ENDPOINTS.readPushStatus.path,
    });
    expect(refused.status).toBe(403);
    expect(await bench.status()).toEqual({
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
