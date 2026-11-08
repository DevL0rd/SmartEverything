import { describe, expect, it } from 'vitest';
import {
  CALENDAR_API,
  eventsUrl,
  exchangeBody,
  link,
  pkcePair,
  authorizationUrl,
  session,
  textOf,
  tokenRequest,
  type Api,
} from './helpers';
import {
  createFakeGoogle,
  type FakeGoogle,
  type FakeGoogleOptions,
  type PushNotification,
} from './index';

const EMAIL = 'owner@example.test';
const ADDRESS = 'https://hub.example.test/google/push';
const TIMED = {
  start: { dateTime: '2026-11-09T10:00:00Z' },
  end: { dateTime: '2026-11-09T11:00:00Z' },
};

interface Setup {
  readonly google: FakeGoogle;
  readonly api: Api;
}

async function setup(options: FakeGoogleOptions = {}): Promise<Setup> {
  const google = createFakeGoogle(options);
  const tokens = await link(google, EMAIL);
  return { google, api: session(google, tokens.access_token) };
}

function watchBody(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type: 'web_hook', address: ADDRESS, token: 'channel-secret', ...extra };
}

const WATCH_URL = `${CALENDAR_API}/calendars/primary/events/watch`;

describe('fake Google push channels', () => {
  it('sends a sync message on creation and an exists message on every change', async () => {
    const received: PushNotification[] = [];
    const { google, api } = await setup({
      deliver: (notification) => {
        received.push(notification);
      },
    });
    const channel = await api.post(WATCH_URL, watchBody('chan-1'));
    expect(channel.status).toBe(200);
    expect(channel.body).toMatchObject({
      kind: 'api#channel',
      id: 'chan-1',
      token: 'channel-secret',
    });
    await api.post(eventsUrl(EMAIL), { summary: 'x', ...TIMED });
    await google.channels.flush();
    expect(received.map((n) => n.headers['X-Goog-Resource-State'])).toEqual(['sync', 'exists']);
    expect(received.map((n) => n.headers['X-Goog-Message-Number'])).toEqual(['1', '2']);
    expect(received[1]?.headers).toMatchObject({
      'X-Goog-Channel-ID': 'chan-1',
      'X-Goog-Channel-Token': 'channel-secret',
      'X-Goog-Resource-ID': textOf(channel, 'resourceId'),
    });
    expect(received[1]?.address).toBe(ADDRESS);
  });

  it('notifies a calendar list channel when a calendar is added', async () => {
    const { google, api } = await setup();
    await api.post(`${CALENDAR_API}/users/me/calendarList/watch`, watchBody('list-1'));
    google.account(EMAIL).calendars.add({ id: 'family@group.test', summary: 'Family' });
    expect(google.channels.notifications.map((n) => n.headers['X-Goog-Resource-State'])).toEqual([
      'sync',
      'exists',
    ]);
  });

  it('rejects non-https addresses and duplicate channel ids', async () => {
    const { api } = await setup();
    const insecure = await api.post(WATCH_URL, watchBody('c', { address: 'http://hub.test/x' }));
    expect(insecure.status).toBe(400);
    expect(insecure.body).toMatchObject({
      error: { errors: [{ reason: 'push.webhookUrlNotHttps' }] },
    });
    await api.post(WATCH_URL, watchBody('dup'));
    const again = await api.post(WATCH_URL, watchBody('dup'));
    expect(again.status).toBe(400);
  });

  it('stops a channel and refuses an unknown or mismatched one', async () => {
    const { google, api } = await setup();
    const channel = await api.post(WATCH_URL, watchBody('chan-2'));
    const stopUrl = `${CALENDAR_API}/channels/stop`;
    const wrong = await api.post(stopUrl, { id: 'chan-2', resourceId: 'other' });
    expect(wrong.status).toBe(404);
    const stopped = await api.post(stopUrl, {
      id: 'chan-2',
      resourceId: textOf(channel, 'resourceId'),
    });
    expect(stopped.status).toBe(204);
    const before = google.channels.notifications.length;
    await api.post(eventsUrl(EMAIL), { summary: 'x', ...TIMED });
    expect(google.channels.notifications).toHaveLength(before);
    expect(google.channels.active()).toHaveLength(0);
  });

  it('caps the expiration and stops notifying once a channel has expired', async () => {
    const { google, api } = await setup({ maxChannelLifetimeMs: 60_000 });
    const asked = google.clock.nowMs() + 3_600_000;
    const channel = await api.post(WATCH_URL, watchBody('chan-3', { expiration: String(asked) }));
    expect(Number(channel.body['expiration'])).toBe(google.clock.nowMs() + 60_000);
    google.clock.advance(61_000);
    const before = google.channels.notifications.length;
    google
      .account(EMAIL)
      .calendars.events('primary')
      .insert({ summary: 'late', ...TIMED });
    expect(google.channels.notifications).toHaveLength(before);
  });

  it('records a failing delivery hook instead of losing it', async () => {
    const { google, api } = await setup({
      deliver: () => {
        throw new Error('receiver down');
      },
    });
    await api.post(WATCH_URL, watchBody('chan-4'));
    await google.channels.flush();
    expect(google.channels.deliveryFailures).toHaveLength(1);
  });
});

describe('fake Google faults and request log', () => {
  it('answers 429 usageLimits with Retry-After for the configured number of requests', async () => {
    const { google, api } = await setup();
    google.faults.fail({ times: 2, status: 429, retryAfterSeconds: 3, pathIncludes: '/events' });
    const first = await api.get(eventsUrl(EMAIL));
    expect(first.status).toBe(429);
    expect(first.headers.get('retry-after')).toBe('3');
    expect(first.body).toMatchObject({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded' }],
      },
    });
    expect((await api.get(eventsUrl(EMAIL))).status).toBe(429);
    expect((await api.get(eventsUrl(EMAIL))).status).toBe(200);
  });

  it('stops injecting once the faults are cleared', async () => {
    const { google, api } = await setup();
    google.faults.fail({ times: 5, status: 500 });
    expect((await api.get(eventsUrl(EMAIL))).status).toBe(500);
    google.faults.clear();
    expect((await api.get(eventsUrl(EMAIL))).status).toBe(200);
  });

  it('answers 403 userRateLimitExceeded and server errors on demand', async () => {
    const { google, api } = await setup();
    google.faults.fail({ times: 1, status: 403, reason: 'userRateLimitExceeded' });
    const limited = await api.get(eventsUrl(EMAIL));
    expect(limited.body).toMatchObject({
      error: { errors: [{ domain: 'usageLimits', reason: 'userRateLimitExceeded' }] },
    });
    google.faults.fail({ times: 1, status: 503, method: 'POST' });
    expect((await api.get(eventsUrl(EMAIL))).status).toBe(200);
    expect((await api.post(eventsUrl(EMAIL), { summary: 'x', ...TIMED })).status).toBe(503);
  });

  it('can fail the token endpoint and records every request', async () => {
    const { google } = await setup();
    google.faults.fail({ times: 1, status: 503, host: 'oauth2.googleapis.com' });
    const { verifier, challenge } = pkcePair();
    const consent = google.oauth.consent(authorizationUrl({ challenge }), EMAIL);
    const failed = await tokenRequest(google, exchangeBody(consent.code, verifier));
    expect(failed.status).toBe(503);
    expect(google.requests.at(-1)).toMatchObject({
      method: 'POST',
      host: 'oauth2.googleapis.com',
      path: '/token',
      status: 503,
    });
  });

  it('logs the If-Match header and query of API calls', async () => {
    const { google, api } = await setup();
    const created = await api.post(eventsUrl(EMAIL), { summary: 'x', ...TIMED });
    await api.patch(
      `${eventsUrl(EMAIL)}/${textOf(created, 'id')}`,
      { summary: 'y' },
      { 'If-Match': textOf(created, 'etag') },
    );
    expect(google.requests.at(-1)).toMatchObject({
      method: 'PATCH',
      ifMatch: textOf(created, 'etag'),
      status: 200,
    });
  });

  it('throws for a host that Google does not serve', async () => {
    const { google } = await setup();
    await expect(google.fetch('https://example.test/x', { method: 'GET' })).rejects.toThrow(
      'no host',
    );
  });
});
