import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach } from 'vitest';
import { systemClock, type Clock } from '../../src/clock';
import {
  startServer,
  type ModuleRegistry,
  type RunningServer,
  type ServerOptions,
} from '../../src/main';
import { CAMERA, LAMP, fakeModule, type FakeModule } from './fake-provider';
import { captureLogs, testLogger } from './logs';
import { LogLines } from '../../src/service/log-lines';
import { call, fakeGo2rtcServer, freePort, openLive, temporaryDirectory } from './server';

export const PUBLIC_URL = 'https://home.example.com';

export interface Booted {
  readonly server: RunningServer;
  readonly fake: FakeModule;
  readonly base: string;
  readonly owner: string;
  readonly moveClock: (milliseconds: number) => void;
}

export function tunnel(base: () => string): typeof fetch {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== PUBLIC_URL) {
      return Promise.reject(new Error(`unexpected request to ${url.origin}`));
    }
    return fetch(`${base()}${url.pathname}`, init);
  };
}

export function xiaomiWithCameraLogin(fake: FakeModule): ModuleRegistry {
  return {
    xiaomi: {
      ...fake.module,
      link: async (credentials, context) => ({
        ...(await fake.module.link(credentials, context)),
        secrets: { userId: '1234567', passToken: 'pass-token' },
      }),
    },
  };
}

export async function bootServer(
  directory: string,
  extra: Partial<ServerOptions> = {},
): Promise<Booted> {
  const fake = fakeModule();
  fake.adapter.devices = [LAMP, CAMERA];
  let offset = 0;
  const clock: Clock = { ...systemClock, now: () => new Date(Date.now() + offset) };
  let base = '';
  const server = await startServer({
    dataDirectory: directory,
    port: 0,
    host: '127.0.0.1',
    go2rtcBinary: await fakeGo2rtcServer(directory),
    go2rtcApiPort: await freePort(),
    go2rtcRtspPort: await freePort(),
    webrtcPort: await freePort(),
    log: testLogger('server'),
    fatal: (cause) => {
      throw cause;
    },
    modules: xiaomiWithCameraLogin(fake),
    fetch: tunnel(() => base),
    clock,
    logLines: new LogLines(),
    ...extra,
  });
  base = server.url;
  return {
    server,
    fake,
    base,
    owner: server.ownerToken,
    moveClock: (milliseconds): void => {
      offset += milliseconds;
    },
  };
}

export async function linkFakeProvider(booted: Booted): Promise<void> {
  const live = await openLive(booted.base, booted.owner);
  live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['provider_links'], streams: [] }));
  await live.next((message) => message.type === 'subscribed');
  await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/providers/link',
    body: { provider: 'xiaomi', username: 'me@example.com', password: 'pw', region: 'de' },
  });
  await live.next(
    (message) =>
      message.type === 'change' &&
      message.table === 'provider_links' &&
      message.record?.status === 'linked',
  );
  live.socket.close();
}

export async function verifiedPublicUrl(booted: Booted): Promise<void> {
  await call(booted.base, booted.owner, {
    method: 'PUT',
    path: '/api/settings/public-url',
    body: { url: PUBLIC_URL },
  });
  await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/settings/public-url/verify',
  });
}

export async function pairPhone(
  booted: Booted,
  role: 'owner' | 'member' = 'member',
  profileId?: string,
): Promise<{ token: string; clientId: string; profileId: string | null }> {
  const started = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/pair/start',
    body: profileId === undefined ? { role } : { role, profileId },
  });
  const code = API_ENDPOINTS.startPairing.response.parse(started.body).code;
  const claimed = await call(booted.base, null, {
    method: 'POST',
    path: '/api/pair/claim',
    body: { code, name: 'Pixel', platform: 'android' },
  });
  const phone = API_ENDPOINTS.claimPairing.response.parse(claimed.body);
  return { token: phone.token, clientId: phone.client.id, profileId: phone.client.profile_id };
}

export interface BootedSuite {
  current: Booted;
}

export function useBootedServer(options: { readonly linked: boolean }): BootedSuite {
  let directory: { path: string; remove: () => Promise<void> } | null = null;
  const suite: { current: Booted | null } = { current: null };
  beforeEach(async () => {
    captureLogs();
    directory = await temporaryDirectory();
    suite.current = await bootServer(directory.path);
    if (options.linked) {
      await linkFakeProvider(suite.current);
    }
  });
  afterEach(async () => {
    await suite.current?.server.stop();
    await directory?.remove();
  });
  return {
    get current(): Booted {
      if (suite.current === null) {
        throw new Error('the server is booted before each test');
      }
      return suite.current;
    },
  };
}
