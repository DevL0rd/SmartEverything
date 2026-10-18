import { API_ENDPOINTS, type SmartThingsAppStatus } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { bootServer, pairPhone, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { FakeCloud, json } from '../smartthings/fake-cloud';
import {
  API,
  DEVICE_LIST_URL,
  LAMP,
  LOCATIONS,
  ROOMS,
  TOKEN_RESPONSE,
} from '../smartthings/fixtures';
import { KEY_ID, WebhookSigner } from './signer';

const PUBLIC_URL = 'https://home.example.com';

const CONFIRMATION_URL = `${API}/apps/app-id/confirm-registration?token=t-1`;

const INSTALLED = `${API}/v1/installedapps/app-1`;

const APPS = `${API}/v1/apps`;

const TOKEN = 'one-time-token';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let cloud: FakeCloud;
let signer: WebhookSigner;
let logs: CapturedLogs;

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function createdApp(body: string | null): unknown {
  const created = z
    .object({ appName: z.string(), apiOnly: z.object({ targetUrl: z.string() }) })
    .parse(JSON.parse(body ?? '{}'));
  return {
    app: {
      appId: 'app-id',
      appName: created.appName,
      apiOnly: {
        subscription: { targetUrl: created.apiOnly.targetUrl, targetStatus: 'CONFIRMED' },
      },
    },
    oauthClientId: 'client-1',
    oauthClientSecret: 'secret-1',
  };
}

function smartThingsCloud(): FakeCloud {
  const unknown = (): Response => json({ error: { code: 'NotFoundError', message: 'No.' } }, 404);
  return new FakeCloud()
    .always('GET', `https://key.smartthings.com${KEY_ID}`, () => new Response(signer.certificate))
    .always('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE))
    .always('GET', `${API}/v1/locations`, () => json(LOCATIONS))
    .always('GET', `${API}/v1/locations/loc-1/rooms`, () => json(ROOMS))
    .always('GET', DEVICE_LIST_URL, () => json({ items: [LAMP] }))
    .always('GET', `${API}/v1/capabilities/switch/1`, unknown)
    .always('GET', `${API}/v1/capabilities/switchLevel/1`, unknown)
    .always('GET', `${API}/v1/capabilities/refresh/1`, unknown)
    .always('GET', `${API}/v1/devices/lamp-1/status`, () =>
      json({ components: { main: { switch: { switch: { value: 'on' } } } } }),
    )
    .always('GET', APPS, () => json({ items: [], _links: {} }))
    .always('POST', APPS, (request) => json(createdApp(request.body)))
    .always('GET', INSTALLED, () => json({ installedAppId: 'app-1', locationId: 'loc-1' }))
    .always('GET', `${INSTALLED}/subscriptions`, () => json({ items: [] }))
    .always('POST', `${INSTALLED}/subscriptions`, () => json({ id: 'sub' }))
    .always('GET', CONFIRMATION_URL, () =>
      json({ targetUrl: `${PUBLIC_URL}/smartthings/webhook` }),
    );
}

beforeEach(async () => {
  logs = captureLogs();
  directory = await temporaryDirectory();
  signer = new WebhookSigner();
  cloud = smartThingsCloud();
  booted = await bootServer(directory.path, {
    fetch: (input, init) => {
      const url = new URL(urlOf(input));
      return url.origin === PUBLIC_URL
        ? fetch(`${booted.base}${url.pathname}`, init)
        : cloud.fetch(url.href, init);
    },
  });
  await verifiedPublicUrl(booted);
});

afterEach(async () => {
  vi.useRealTimers();
  await booted.server.stop();
  await directory.remove();
});

async function setUp(token = TOKEN): Promise<Awaited<ReturnType<typeof call>>> {
  return call(booted.base, booted.owner, {
    method: 'POST',
    path: API_ENDPOINTS.setUpSmartThings.path,
    body: { token },
  });
}

async function saveApp(): Promise<void> {
  const saved = await setUp();
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({ outcome: 'ready' });
}

async function authorize(): Promise<URL> {
  const reply = await call(booted.base, booted.owner, {
    method: 'POST',
    path: API_ENDPOINTS.authorizeSmartThings.path,
  });
  expect(reply.status).toBe(200);
  return new URL(API_ENDPOINTS.authorizeSmartThings.response.parse(reply.body).url);
}

async function callback(query: Record<string, string>): Promise<string> {
  const response = await fetch(
    `${booted.base}/smartthings/callback?${new URLSearchParams(query).toString()}`,
    { redirect: 'manual' },
  );
  expect(response.status).toBe(303);
  return response.headers.get('location') ?? '';
}

async function page(location: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${booted.base}${location}`);
  return { status: response.status, text: await response.text() };
}

async function link(): Promise<void> {
  await saveApp();
  const url = await authorize();
  const location = await callback({ code: 'code-1', state: url.searchParams.get('state') ?? '' });
  expect(location).toBe('/smartthings/linked?outcome=linked');
}

function post(body: string, headers: Record<string, string>): Promise<Response> {
  return fetch(`${booted.base}/smartthings/webhook`, { method: 'POST', headers, body });
}

function eventBody(value: string): string {
  return JSON.stringify({
    lifecycle: 'EVENT',
    eventData: {
      installedApp: { installedAppId: 'app-1', locationId: 'loc-1' },
      events: [
        {
          eventTime: new Date().toISOString(),
          eventType: 'DEVICE_EVENT',
          deviceEvent: {
            deviceId: 'lamp-1',
            componentId: 'main',
            capability: 'switch',
            attribute: 'switch',
            value,
            stateChange: true,
          },
        },
      ],
    },
  });
}

async function powerOfLamp(): Promise<unknown> {
  const devices = await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' });
  const lamp = API_ENDPOINTS.listDevices.response
    .parse(devices.body)
    .find((device) => device.external_id === 'lamp-1');
  const state = await call(booted.base, booted.owner, { method: 'GET', path: '/api/device-state' });
  return API_ENDPOINTS.listState.response
    .parse(state.body)
    .find((row) => row.device_id === lamp?.id && row.capability === 'power')?.value;
}

async function appStatus(): Promise<SmartThingsAppStatus> {
  const reply = await call(booted.base, booted.owner, {
    method: 'GET',
    path: API_ENDPOINTS.readSmartThingsApp.path,
  });
  return API_ENDPOINTS.readSmartThingsApp.response.parse(reply.body);
}

describe('the SmartThings app', () => {
  it('sets the app up from a one-time token, keeps only the app credentials and shows the URLs to register', async () => {
    expect(await appStatus()).toEqual({
      app: null,
      publicUrl: 'verified',
      redirectUri: `${PUBLIC_URL}/smartthings/callback`,
      webhookUrl: `${PUBLIC_URL}/smartthings/webhook`,
      webhook: { confirmedAt: null, lastEventAt: null, lastError: null },
    });
    const created = cloud.sent('POST', APPS);
    expect(created).toHaveLength(0);
    await saveApp();
    expect(cloud.sent('POST', APPS)).toHaveLength(1);
    expect(cloud.sent('POST', APPS)[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    const status = await appStatus();
    expect(status.app).toEqual({ appId: 'app-id', clientId: 'client-1' });
    expect(JSON.stringify(status)).not.toMatch(/secret-1|one-time-token/);
  });

  it('names a refused token or missing scopes without echoing the token', async () => {
    cloud.on('GET', APPS, () => json({ error: { code: 'Unauthorized', message: TOKEN } }, 401));
    const refused = await setUp();
    expect(refused.body).toMatchObject({ outcome: 'token_refused' });
    expect(JSON.stringify(refused.body)).not.toContain(TOKEN);
    cloud.on('GET', APPS, () => json({ error: { code: 'Forbidden', message: 'No.' } }, 403));
    expect((await setUp()).body).toMatchObject({
      outcome: 'scopes_missing',
      missing: ['r:apps:*'],
    });
    expect((await appStatus()).app).toBeNull();
  });

  it('lets only owners see or change it, and refuses an invalid token', async () => {
    const phone = await pairPhone(booted, 'member');
    const reads = await call(booted.base, phone.token, {
      method: 'GET',
      path: API_ENDPOINTS.readSmartThingsApp.path,
    });
    expect(reads.status).toBe(403);
    const sets = await call(booted.base, phone.token, {
      method: 'POST',
      path: API_ENDPOINTS.setUpSmartThings.path,
      body: { token: TOKEN },
    });
    expect(sets.status).toBe(403);
    expect((await setUp(' ')).status).toBe(400);
  });

  it('needs the app before it builds a sign-in link', async () => {
    const reply = await call(booted.base, booted.owner, {
      method: 'POST',
      path: API_ENDPOINTS.authorizeSmartThings.path,
    });
    expect(reply.status).toBe(409);
  });

  it('needs a saved public URL before it builds a sign-in link', async () => {
    await saveApp();
    await call(booted.base, booted.owner, {
      method: 'PUT',
      path: '/api/settings/public-url',
      body: { url: null },
    });
    const reply = await call(booted.base, booted.owner, {
      method: 'POST',
      path: API_ENDPOINTS.authorizeSmartThings.path,
    });
    expect(reply.status).toBe(422);
  });

  it('builds the sign-in link for a saved address that is not verified yet', async () => {
    await saveApp();
    await call(booted.base, booted.owner, {
      method: 'PUT',
      path: '/api/settings/public-url',
      body: { url: 'https://elsewhere.example.com' },
    });
    const url = await authorize();
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://elsewhere.example.com/smartthings/callback',
    );
  });
});

describe('linking SmartThings', () => {
  it('builds the sign-in link, exchanges the code, subscribes and says it is linked', async () => {
    await saveApp();
    const url = await authorize();
    expect(`${url.origin}${url.pathname}`).toBe('https://api.smartthings.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe(`${PUBLIC_URL}/smartthings/callback`);
    expect(url.searchParams.get('scope')).toBe(
      'r:devices:* x:devices:* r:locations:* r:scenes:* x:scenes:*',
    );
    const location = await callback({ code: 'code-1', state: url.searchParams.get('state') ?? '' });
    expect(location).toBe('/smartthings/linked?outcome=linked');
    const shown = await page(location);
    expect(shown.status).toBe(200);
    expect(shown.text).toContain('Linked — return to the app.');
    expect(cloud.sent('POST', `${API}/oauth/token`)[0]?.body).toBe(
      `grant_type=authorization_code&client_id=client-1&code=code-1&redirect_uri=${encodeURIComponent(`${PUBLIC_URL}/smartthings/callback`)}`,
    );
    expect(cloud.sent('POST', `${INSTALLED}/subscriptions`)).toHaveLength(5);
    const providers = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/providers',
    });
    expect(JSON.stringify(providers.body)).toContain('"status":"linked"');
    expect(await callback({ code: 'code-1', state: url.searchParams.get('state') ?? '' })).toBe(
      '/smartthings/linked?outcome=expired',
    );
  });

  it('says linking failed when SmartThings refuses the code', async () => {
    cloud.on('POST', `${API}/oauth/token`, () => json({ error: 'invalid_grant' }, 400));
    await saveApp();
    const url = await authorize();
    const location = await callback({ code: 'bad', state: url.searchParams.get('state') ?? '' });
    expect(location).toBe('/smartthings/linked?outcome=failed');
    expect((await page(location)).status).toBe(502);
  });

  it('says linking was cancelled, expired or unreadable', async () => {
    await saveApp();
    const url = await authorize();
    const state = url.searchParams.get('state') ?? '';
    expect(await callback({ error: 'access_denied', state })).toBe(
      '/smartthings/linked?outcome=cancelled',
    );
    expect(await callback({ code: 'c', state })).toBe('/smartthings/linked?outcome=expired');
    expect(await callback({ code: 'c' })).toBe('/smartthings/linked?outcome=malformed');
    expect((await page('/smartthings/linked?outcome=cancelled')).text).toContain(
      'Linking was cancelled',
    );
    expect((await page('/smartthings/linked?outcome=nonsense')).status).toBe(400);
  });

  it('lets a sign-in link expire after ten minutes', async () => {
    await saveApp();
    const url = await authorize();
    booted.moveClock(10 * 60 * 1000);
    expect(await callback({ code: 'c', state: url.searchParams.get('state') ?? '' })).toBe(
      '/smartthings/linked?outcome=expired',
    );
  });
});

describe('the SmartThings webhook', () => {
  it('turns a signed device event into device state', async () => {
    await link();
    expect(await powerOfLamp()).toBe(true);
    const body = eventBody('off');
    const response = await post(body, signer.headers(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ eventData: {} });
    await vi.waitFor(async () => {
      expect(await powerOfLamp()).toBe(false);
    });
    expect((await appStatus()).webhook.lastEventAt).not.toBeNull();
    expect(cloud.sent('GET', `https://key.smartthings.com${KEY_ID}`)).toHaveLength(1);
    const again = eventBody('on');
    expect((await post(again, signer.headers(again))).status).toBe(200);
    expect(cloud.sent('GET', `https://key.smartthings.com${KEY_ID}`)).toHaveLength(1);
  });

  it('refuses requests that are unsigned, signed by another key, stale or altered', async () => {
    await link();
    const body = eventBody('off');
    const other = new WebhookSigner();
    const refusals = [
      await post(body, { 'content-type': 'application/json' }),
      await post(body, other.headers(body)),
      await post(body, signer.headers(body, { date: new Date(Date.now() - 6 * 60 * 1000) })),
      await post(body, signer.headers(body, { digestOf: eventBody('on') })),
      await post(body, signer.headers(body, { path: '/elsewhere' })),
    ];
    expect(refusals.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    expect(await powerOfLamp()).toBe(true);
    expect((await appStatus()).webhook.lastError).toBe(
      'The SmartThings webhook request was refused: the signature does not match the SmartThings key.',
    );
    expect(logs.events()).toContain('webhook.refused');
  });

  it('confirms the target URL of its own app by fetching the SmartThings confirmation URL', async () => {
    await saveApp();
    const body = JSON.stringify({
      messageType: 'CONFIRMATION',
      confirmationData: { appId: 'app-id', confirmationUrl: CONFIRMATION_URL },
    });
    const response = await post(body, signer.headers(body));
    expect(response.status).toBe(200);
    expect(cloud.sent('GET', CONFIRMATION_URL)).toHaveLength(1);
    expect((await appStatus()).webhook.confirmedAt).not.toBeNull();
  });

  it('refuses a confirmation for another app or outside SmartThings and reports a failed confirmation', async () => {
    await saveApp();
    const stranger = JSON.stringify({
      messageType: 'CONFIRMATION',
      confirmationData: { appId: 'other-app', confirmationUrl: CONFIRMATION_URL },
    });
    expect((await post(stranger, signer.headers(stranger))).status).toBe(403);
    expect(cloud.sent('GET', CONFIRMATION_URL)).toHaveLength(0);
    const foreign = JSON.stringify({
      messageType: 'CONFIRMATION',
      confirmationData: { appId: 'app-id', confirmationUrl: 'https://evil.example.com/x' },
    });
    expect((await post(foreign, signer.headers(foreign))).status).toBe(400);
    cloud.on('GET', CONFIRMATION_URL, () => json({ error: 'gone' }, 410));
    const body = JSON.stringify({
      messageType: 'CONFIRMATION',
      confirmationData: { appId: 'app-id', confirmationUrl: CONFIRMATION_URL },
    });
    expect((await post(body, signer.headers(body))).status).toBe(502);
    expect((await appStatus()).webhook.lastError).toBe(
      'SmartThings answered the confirmation with HTTP 410: {"error":"gone"}',
    );
  });

  it('answers a PING challenge and ignores lifecycles it does not handle', async () => {
    const ping = await post(JSON.stringify({ lifecycle: 'PING', pingData: { challenge: 'c-1' } }), {
      'content-type': 'application/json',
    });
    expect(await ping.json()).toEqual({ pingData: { challenge: 'c-1' } });
    const body = JSON.stringify({ lifecycle: 'UNINSTALL' });
    expect((await post(body, signer.headers(body))).status).toBe(200);
    expect(logs.events()).toContain('webhook.ignored');
  });

  it('accepts events for an installed app it does not run, and logs them', async () => {
    const body = eventBody('off');
    expect((await post(body, signer.headers(body))).status).toBe(200);
    expect(logs.events()).toContain('webhook.unrouted');
  });

  it('refuses a body that is not a webhook message', async () => {
    expect((await post('{', { 'content-type': 'application/json' })).status).toBe(400);
    expect((await post('"text"', { 'content-type': 'application/json' })).status).toBe(400);
  });

  it('reports a key server that cannot be reached', async () => {
    cloud.on(
      'GET',
      `https://key.smartthings.com${KEY_ID}`,
      () => new Response('down', { status: 503 }),
    );
    const body = eventBody('off');
    expect((await post(body, signer.headers(body))).status).toBe(502);
    cloud.on('GET', `https://key.smartthings.com${KEY_ID}`, () =>
      Promise.reject(new Error('reset')),
    );
    expect((await post(body, signer.headers(body))).status).toBe(502);
  });
});
