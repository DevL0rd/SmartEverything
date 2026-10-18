import { API_ENDPOINTS, type DeviceEvent, type PushStatus } from '@smarteverything/domain';
import { afterEach, beforeEach, expect } from 'vitest';
import {
  bootServer,
  linkFakeProvider,
  pairPhone,
  verifiedPublicUrl,
  type Booted,
} from '../support/booted';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { FakeGoogle, SERVICE_ACCOUNT } from './fake-google';

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

interface BenchPhone {
  readonly clientId: string;
  readonly token: string;
}

class PushBench {
  logs: CapturedLogs = captureLogs();
  google = new FakeGoogle();
  private running: Booted | null = null;
  private directory: { path: string; remove: () => Promise<void> } | null = null;

  get booted(): Booted {
    if (this.running === null) {
      throw new Error('the push bench is set up before each test');
    }
    return this.running;
  }

  async start(): Promise<void> {
    this.logs = captureLogs();
    this.google = new FakeGoogle();
    this.directory = await temporaryDirectory();
    const server = await bootServer(this.directory.path, {
      fetch: (input, init) => this.route(urlOf(input), init),
    });
    this.running = server;
    await linkFakeProvider(server);
    await verifiedPublicUrl(server);
  }

  async stop(): Promise<void> {
    await this.running?.server.stop();
    await this.directory?.remove();
  }

  async saveAccount(): Promise<void> {
    const saved = await call(this.booted.base, this.booted.owner, {
      method: 'PUT',
      path: '/api/settings/push',
      body: { serviceAccount: SERVICE_ACCOUNT },
    });
    expect(saved.status).toBe(200);
  }

  async registerPhone(token: string): Promise<BenchPhone> {
    const phone = await pairPhone(this.booted);
    const saved = await call(this.booted.base, phone.token, {
      method: 'PUT',
      path: '/api/push-targets',
      body: { token, platform: 'android' },
    });
    expect(saved.status).toBe(200);
    return phone;
  }

  pairWithoutPushTarget(): Promise<BenchPhone> {
    return pairPhone(this.booted);
  }

  happen(event: Partial<DeviceEvent>): void {
    this.booted.fake.adapter.sink?.event({
      externalId: 'camera-1',
      kind: 'doorbell',
      occurredAt: new Date().toISOString(),
      details: {},
      ...event,
    });
  }

  async status(): Promise<PushStatus> {
    const reply = await call(this.booted.base, this.booted.owner, {
      method: 'GET',
      path: API_ENDPOINTS.readPushStatus.path,
    });
    expect(reply.status).toBe(200);
    return API_ENDPOINTS.readPushStatus.response.parse(reply.body);
  }

  async targets(): Promise<readonly string[]> {
    const reply = await call(this.booted.base, this.booted.owner, {
      method: 'GET',
      path: '/api/push-targets',
    });
    const rows = Array.isArray(reply.body) ? reply.body : [];
    return rows.map((row) => /"token":"([^"]+)"/.exec(JSON.stringify(row))?.[1] ?? '');
  }

  private route(url: string, init: RequestInit | undefined): Promise<Response> {
    if (this.google.handles(url)) {
      return Promise.resolve(this.google.respond(url, init));
    }
    const target = new URL(url);
    return target.origin === 'https://home.example.com'
      ? fetch(`${this.booted.base}${target.pathname}`, init)
      : Promise.reject(new Error(`unexpected request to ${url}`));
  }
}

export function usePushBench(): PushBench {
  const bench = new PushBench();
  beforeEach(async () => {
    await bench.start();
  });
  afterEach(async () => {
    await bench.stop();
  });
  return bench;
}
