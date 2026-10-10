import { API_ENDPOINTS, createHealthSourceToken, liveProtocols } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { LAMP } from './support/fake-provider';
import { linkFakeProvider, pairPhone, useBootedServer, verifiedPublicUrl } from './support/booted';
import { call, openLive } from './support/server';

const suite = useBootedServer({ linked: false });

interface RawInit {
  readonly method?: string;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

async function raw(path: string, init: RawInit = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${suite.current.base}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${suite.current.owner}`, ...init.headers },
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

async function refusedUpgrade(protocols: string[]): Promise<number> {
  const socket = new WebSocket(`${suite.current.base.replace('http', 'ws')}/live`, protocols);
  return new Promise((resolve) => {
    socket.once('unexpected-response', (_request, response) => {
      resolve(response.statusCode ?? 0);
    });
    socket.once('error', () => {
      resolve(-1);
    });
  });
}

describe('server protocol', () => {
  it('names what it refuses with the error envelope', async () => {
    expect(await raw('/api/nothing')).toMatchObject({
      status: 404,
      body: { error: { code: 'not_found' } },
    });
    expect(await raw('/api/rooms', { method: 'PATCH' })).toMatchObject({
      status: 405,
      body: { error: { code: 'method_not_allowed' } },
    });
    expect(
      await raw('/api/rooms', {
        method: 'POST',
        body: '{',
        headers: { 'content-type': 'application/json' },
      }),
    ).toMatchObject({
      status: 400,
      body: { error: { code: 'invalid_request' } },
    });
    expect(
      await raw('/api/rooms', {
        method: 'POST',
        body: 'name=x',
        headers: { 'content-type': 'text/plain' },
      }),
    ).toMatchObject({
      status: 415,
    });
    expect(
      await raw('/api/rooms/0d000000-0000-4000-8000-000000000001', {
        method: 'DELETE',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    ).toMatchObject({
      status: 400,
      body: { error: { message: 'DELETE /api/rooms/:roomId takes no body.' } },
    });
    expect(await raw('/api/rooms/not-an-id', { method: 'DELETE' })).toMatchObject({ status: 400 });
    expect(await raw('/api/commands?limit=0')).toMatchObject({ status: 400 });
    expect(await raw('/api/rooms', { headers: { authorization: 'Bearer nope' } })).toMatchObject({
      status: 401,
    });
    expect(
      await raw('/api/rooms/0d000000-0000-4000-8000-000000000001', { method: 'DELETE' }),
    ).toMatchObject({
      status: 404,
      body: { error: { message: 'There is no room 0d000000-0000-4000-8000-000000000001.' } },
    });
  });

  it('answers the desktop origin and refuses any other', async () => {
    const preflight = await fetch(`${suite.current.base}/api/rooms`, {
      method: 'OPTIONS',
      headers: { origin: 'app://smarteverything', 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('app://smarteverything');
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'authorization, content-type, range',
    );
    expect(
      await raw('/api/rooms', { headers: { origin: 'https://evil.example.com' } }),
    ).toMatchObject({ status: 403 });
    const allowed = await fetch(`${suite.current.base}/status`, {
      headers: { origin: 'app://smarteverything' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('app://smarteverything');
  });

  it('opens /live only with its subprotocol and a valid token, and closes on an invalid message', async () => {
    expect(await refusedUpgrade(['other'])).toBe(400);
    expect(
      await refusedUpgrade([...liveProtocols(createHealthSourceToken().replace('hst_', 'set_'))]),
    ).toBe(401);
    expect(
      await new Promise<number>((resolve) => {
        const socket = new WebSocket(`${suite.current.base.replace('http', 'ws')}/elsewhere`);
        socket.once('unexpected-response', (_request, response) => {
          resolve(response.statusCode ?? 0);
        });
      }),
    ).toBe(404);
    const live = await openLive(suite.current.base, suite.current.owner);
    live.socket.send('{"type":"listen"}');
    expect(await live.next((message) => message.type === 'refused')).toMatchObject({
      error: { code: 'invalid_request' },
    });
    expect(await live.closed).toBe(1008);
  });

  it('serves the public status and probe without a token', async () => {
    expect((await fetch(`${suite.current.base}/status`)).status).toBe(200);
    expect((await fetch(`${suite.current.base}/.well-known/smarteverything/abc`)).status).toBe(404);
  });
});

describe('public URL', () => {
  it('reports why a public URL could not be verified', async () => {
    expect(await raw('/api/settings/public-url/verify', { method: 'POST' })).toMatchObject({
      status: 409,
    });
    await call(suite.current.base, suite.current.owner, {
      method: 'PUT',
      path: '/api/settings/public-url',
      body: { url: 'https://other.example.com/base/' },
    });
    const failed = await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: '/api/settings/public-url/verify',
    });
    expect(failed.body).toMatchObject({
      outcome: 'failed',
      settings: { public_url_verified_at: null },
    });
    expect(JSON.stringify(failed.body)).toContain(
      'https://other.example.com/base/.well-known/smarteverything/',
    );
    expect(
      (await call(suite.current.base, null, { method: 'GET', path: '/status' })).body,
    ).toMatchObject({
      publicUrl: { configured: true, verified: false },
    });
  });
});

describe('roles and personal data', () => {
  it('lets members control and read but not manage', async () => {
    await verifiedPublicUrl(suite.current);
    await linkFakeProvider(suite.current);
    const phone = await pairPhone(suite.current);
    const member = (request: {
      method: string;
      path: string;
      body?: unknown;
    }): Promise<{ status: number; body: unknown }> =>
      call(suite.current.base, phone.token, request);
    expect(
      (await member({ method: 'POST', path: '/api/pair/start', body: { role: 'member' } })).status,
    ).toBe(403);
    expect((await member({ method: 'GET', path: '/api/providers/key' })).status).toBe(403);
    expect(
      (await member({ method: 'PUT', path: '/api/settings/public-url', body: { url: null } }))
        .status,
    ).toBe(403);
    expect(
      (
        await member({
          method: 'POST',
          path: '/api/commands',
          body: {
            device_id: null,
            capability: 'hub:unlink_provider',
            value: { provider: 'xiaomi' },
          },
        })
      ).body,
    ).toMatchObject({
      error: { code: 'forbidden', message: 'Only an owner may send hub:unlink_provider.' },
    });
    expect(
      (
        await member({
          method: 'POST',
          path: '/api/commands',
          body: { device_id: null, capability: 'hub:discover', value: { provider: 'tuya' } },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await member({
          method: 'POST',
          path: '/api/commands',
          body: { device_id: null, capability: 'power', value: true },
        })
      ).body,
    ).toMatchObject({
      error: { code: 'command_refused' },
    });
    expect(
      (
        await member({
          method: 'POST',
          path: '/api/commands',
          body: { device_id: null, capability: 'hub:discover', value: {} },
        })
      ).status,
    ).toBe(400);
    const room = await member({ method: 'POST', path: '/api/rooms', body: { name: '  Den ' } });
    expect(room.body).toMatchObject({ name: 'Den', position: 0 });
  });

  it('keeps each client’s layouts to itself, also on /live', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const live = await openLive(suite.current.base, phone.token);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['layouts'] }));
    await live.next((message) => message.type === 'subscribed');
    await call(suite.current.base, suite.current.owner, {
      method: 'PUT',
      path: '/api/layouts/home',
      body: { layout: { owner: true } },
    });
    await call(suite.current.base, phone.token, {
      method: 'PUT',
      path: '/api/layouts/home',
      body: { layout: { phone: true } },
    });
    expect(await live.next((message) => message.type === 'change')).toMatchObject({
      record: { layout: { phone: true } },
    });
    expect(
      (await call(suite.current.base, phone.token, { method: 'GET', path: '/api/layouts/home' }))
        .body,
    ).toStrictEqual({ layout: { phone: true } });
    expect(
      (await call(suite.current.base, phone.token, { method: 'GET', path: '/api/layouts/climate' }))
        .body,
    ).toStrictEqual({ layout: null });
    live.socket.close();
  });

  it('limits pairing attempts', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 11 }, () =>
        call(suite.current.base, null, {
          method: 'POST',
          path: '/api/pair/claim',
          body: { code: 'AAAA-BBBB', name: 'x', platform: 'android' },
        }),
      ),
    );
    expect(attempts.map((attempt) => attempt.status).sort()).toStrictEqual([
      ...Array.from({ length: 10 }, () => 422),
      429,
    ]);
  });
});

describe('scenes, automations, health and assistant access', () => {
  it('runs a scene as validated commands with source scene', async () => {
    await linkFakeProvider(suite.current);
    const devices = API_ENDPOINTS.listDevices.response.parse(
      (await call(suite.current.base, suite.current.owner, { method: 'GET', path: '/api/devices' }))
        .body,
    );
    const lamp = devices.find((device) => device.external_id === LAMP.externalId)?.id ?? '';
    const scene = API_ENDPOINTS.createScene.response.parse(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: '/api/scenes',
          body: {
            name: 'Evening',
            actions: [{ type: 'command', deviceId: lamp, capability: 'brightness', value: 30 }],
          },
        })
      ).body,
    );
    expect(scene).toMatchObject({ icon: 'sparkles', position: 0 });
    const ran = await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: `/api/scenes/${scene.id}/run`,
    });
    expect(ran.body).toMatchObject([
      { device_id: lamp, capability: 'brightness', value: 30, source: 'scene' },
    ]);
    const empty = API_ENDPOINTS.createScene.response.parse(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: '/api/scenes',
          body: { name: 'Empty', actions: [] },
        })
      ).body,
    );
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: `/api/scenes/${empty.id}/run`,
        })
      ).body,
    ).toMatchObject({
      error: { code: 'command_refused', message: 'The scene Empty has no actions.' },
    });
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'PUT',
          path: '/api/scenes/order',
          body: { ids: [empty.id, scene.id] },
        })
      ).body,
    ).toMatchObject([{ name: 'Empty' }, { name: 'Evening' }]);
  });

  it('accepts health uploads only with a health source token and serves the daily figures', async () => {
    const created = API_ENDPOINTS.createHealthSource.response.parse(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: '/api/health/sources',
          body: { name: 'Pixel' },
        })
      ).body,
    );
    const batch = {
      records: [
        {
          recordId: 'r1',
          type: 'Steps',
          startTime: '2026-10-08T06:00:00Z',
          endTime: '2026-10-08T07:00:00Z',
          zoneOffsetSeconds: 0,
          sourceApp: 'fit',
          lastModified: '2026-10-08T07:00:00Z',
          data: { count: 42 },
        },
      ],
      deletions: [],
      grantedTypes: ['Steps'],
      source: { device: 'Pixel', appVersion: '1.0' },
    };
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: '/api/health/ingest',
          body: batch,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(suite.current.base, created.token, {
          method: 'POST',
          path: '/api/health/ingest',
          body: batch,
        })
      ).body,
    ).toStrictEqual({
      stored: 1,
      stale: 0,
      deleted: 0,
      days: ['2026-10-08'],
    });
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'GET',
          path: '/api/health/daily?from=2026-10-01&to=2026-10-31&metrics=steps',
        })
      ).body,
    ).toMatchObject([{ day: '2026-10-08', metric: 'steps', value: 42, unit: 'count' }]);
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'GET',
          path: '/api/health/sources',
        })
      ).body,
    ).toMatchObject([{ last_error: null, granted_types: ['Steps'] }]);
    await call(suite.current.base, suite.current.owner, {
      method: 'DELETE',
      path: `/api/health/sources/${created.source.id}`,
    });
    expect(
      (
        await call(suite.current.base, created.token, {
          method: 'POST',
          path: '/api/health/ingest',
          body: batch,
        })
      ).status,
    ).toBe(401);
  });

  it('creates and revokes personal MCP tokens and stores the push account without returning it', async () => {
    const created = API_ENDPOINTS.createMcpToken.response.parse(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: '/api/mcp/tokens',
          body: { name: 'Claude' },
        })
      ).body,
    );
    expect(created.token).toMatch(/^mcp_[0-9a-f]{64}$/);
    const revoked = await call(suite.current.base, suite.current.owner, {
      method: 'DELETE',
      path: `/api/mcp/tokens/${created.row.id}`,
    });
    expect(API_ENDPOINTS.revokeMcpToken.response.parse(revoked.body).revoked_at).not.toBeNull();
    const account = {
      type: 'service_account',
      project_id: 'home-push',
      client_email: 'push@home-push.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
      token_uri: 'https://oauth2.googleapis.com/token',
    };
    const saved = await call(suite.current.base, suite.current.owner, {
      method: 'PUT',
      path: '/api/settings/push',
      body: { serviceAccount: account },
    });
    expect(saved.body).toMatchObject({ push_project_id: 'home-push' });
    expect(JSON.stringify(saved.body)).not.toContain('PRIVATE KEY');
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'DELETE',
          path: '/api/settings/push',
        })
      ).body,
    ).toMatchObject({ push_project_id: null });
  });
});
