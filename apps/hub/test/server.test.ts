import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DataDirectoryLockedError,
  LOCK_FILE,
  OWNER_TOKEN_FILE,
  startServer,
  type RunningServer,
} from '../src/main';
import { LogLines } from '../src/service/log-lines';
import { LAMP, fakeModule, type FakeModule } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';
import { PUBLIC_URL, tunnel, xiaomiWithCameraLogin } from './support/booted';
import { call, fakeGo2rtcBinary, openLive, temporaryDirectory } from './support/server';

let directory: { path: string; remove: () => Promise<void> };
let running: RunningServer | null = null;
let fake: FakeModule;

async function boot(): Promise<RunningServer> {
  fake = fakeModule();
  let base = '';
  const server = await startServer({
    dataDirectory: directory.path,
    port: 0,
    host: '127.0.0.1',
    go2rtcBinary: await fakeGo2rtcBinary(directory.path),
    log: testLogger('server'),
    fatal: (cause) => {
      throw cause;
    },
    modules: xiaomiWithCameraLogin(fake),
    fetch: tunnel(() => base),
    logLines: new LogLines(),
  });
  base = server.url;
  return server;
}

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
});

afterEach(async () => {
  await running?.stop();
  running = null;
  await directory.remove();
});

describe('startServer', () => {
  it('pairs a phone, runs its command through the hub and pushes the state change over /live', async () => {
    running = await boot();
    const base = running.url;
    const owner = running.ownerToken;
    expect((await readFile(join(directory.path, OWNER_TOKEN_FILE), 'utf8')).trim()).toBe(owner);
    expect((await stat(join(directory.path, OWNER_TOKEN_FILE))).mode & 0o777).toBe(0o600);
    expect(await call(base, null, { method: 'GET', path: '/status' })).toMatchObject({
      status: 200,
      body: { service: 'smarteverything', publicUrl: { configured: false, verified: false } },
    });

    expect(
      (
        await call(base, owner, {
          method: 'POST',
          path: '/api/pair/start',
          body: { role: 'member' },
        })
      ).body,
    ).toMatchObject({
      error: { code: 'public_url_not_verified' },
    });
    await call(base, owner, {
      method: 'PUT',
      path: '/api/settings/public-url',
      body: { url: PUBLIC_URL },
    });
    expect(
      (await call(base, owner, { method: 'POST', path: '/api/settings/public-url/verify' })).body,
    ).toMatchObject({
      outcome: 'verified',
    });

    const ownerLive = await openLive(base, owner);
    ownerLive.socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['provider_links', 'clients'], streams: [] }),
    );
    expect(await ownerLive.next((message) => message.type === 'subscribed')).toMatchObject({
      tables: ['provider_links', 'clients'],
      streams: [],
    });
    const link = await call(base, owner, {
      method: 'POST',
      path: '/api/providers/link',
      body: { provider: 'xiaomi', username: 'me@example.com', password: 'pw', region: 'de' },
    });
    expect(link).toMatchObject({ status: 200, body: { ok: true } });
    await ownerLive.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'provider_links' &&
        message.record?.status === 'linked',
    );
    ownerLive.socket.close();

    const pairing = await call(base, owner, {
      method: 'POST',
      path: '/api/pair/start',
      body: { role: 'member' },
    });
    const code = API_ENDPOINTS.startPairing.response.parse(pairing.body);
    expect(code.qr).toMatchObject({ url: PUBLIC_URL, code: code.code });
    expect(code.qr.identity.tls.certificateSha256).toMatch(/^[0-9a-f]{64}$/);
    const claimed = await call(base, null, {
      method: 'POST',
      path: '/api/pair/claim',
      body: { code: code.code, name: 'Pixel', platform: 'android' },
    });
    const phone = API_ENDPOINTS.claimPairing.response.parse(claimed.body);
    expect(phone.client).toMatchObject({ name: 'Pixel', role: 'member', built_in: false });
    expect(
      (
        await call(base, null, {
          method: 'POST',
          path: '/api/pair/claim',
          body: { code: code.code, name: 'Again', platform: 'android' },
        })
      ).body,
    ).toMatchObject({
      error: { code: 'pairing_code_invalid' },
    });

    const live = await openLive(base, phone.token);
    expect(await live.next((message) => message.type === 'ready')).toMatchObject({
      role: 'member',
    });
    live.socket.send(
      JSON.stringify({
        type: 'subscribe',
        tables: ['device_state', 'commands', 'clients'],
        streams: [],
      }),
    );
    expect(await live.next((message) => message.type === 'subscribed')).toMatchObject({
      tables: ['device_state', 'commands'],
      streams: [],
    });

    const devices = API_ENDPOINTS.listDevices.response.parse(
      (await call(base, phone.token, { method: 'GET', path: '/api/devices' })).body,
    );
    const lamp = devices.find((device) => device.external_id === LAMP.externalId);
    const sent = await call(base, phone.token, {
      method: 'POST',
      path: '/api/commands',
      body: { device_id: lamp?.id ?? '', capability: 'power', value: true },
    });
    expect(sent.body).toMatchObject({
      status: 'pending',
      source: 'app',
      requested_by: phone.client.id,
    });
    const finished = await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'commands' &&
        message.record?.status === 'succeeded',
    );
    expect(finished).toMatchObject({ operation: 'UPDATE' });
    fake.adapter.sink?.state({
      externalId: LAMP.externalId,
      capability: 'power',
      value: true,
      observedAt: '2026-10-08T10:00:00Z',
    });
    expect(
      await live.next((message) => message.type === 'change' && message.table === 'device_state'),
    ).toMatchObject({
      record: { device_id: lamp?.id, capability: 'power', value: true },
    });

    expect((await call(base, phone.token, { method: 'GET', path: '/api/clients' })).status).toBe(
      403,
    );
    expect(
      (
        await call(base, phone.token, {
          method: 'POST',
          path: '/api/commands',
          body: { device_id: lamp?.id, capability: 'power', value: 'on' },
        })
      ).body,
    ).toMatchObject({
      error: { code: 'command_refused' },
    });
    await call(base, owner, { method: 'DELETE', path: `/api/clients/${phone.client.id}` });
    expect(await live.closed).toBe(4001);
    expect((await call(base, phone.token, { method: 'GET', path: '/api/session' })).status).toBe(
      401,
    );
  });

  it('refuses a second server on the same data directory, rotates the owner token and shuts down cleanly', async () => {
    running = await boot();
    await expect(boot()).rejects.toThrow(DataDirectoryLockedError);
    const old = running.ownerToken;
    const fresh = await running.rotateOwnerToken();
    expect((await call(running.url, old, { method: 'GET', path: '/api/session' })).status).toBe(
      401,
    );
    expect(
      (await call(running.url, fresh, { method: 'GET', path: '/api/session' })).body,
    ).toMatchObject({
      client: { role: 'owner', built_in: true },
      hub: { cameras: 'running' },
    });
    await running.stop();
    running = null;
    await expect(stat(join(directory.path, LOCK_FILE))).rejects.toThrow(/ENOENT/);
    running = await boot();
    expect(running.ownerToken).toBe(fresh);
  });
});
