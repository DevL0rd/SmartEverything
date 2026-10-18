import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootServer,
  linkFakeProvider,
  pairPhone,
  verifiedPublicUrl,
  type Booted,
} from '../support/booted';
import { captureLogs } from '../support/logs';
import { consentPage, pkce, register } from '../mcp/client';
import { call, temporaryDirectory } from '../support/server';
import { FakeGoogle, SERVICE_ACCOUNT } from './fake-google';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let google: FakeGoogle;

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

beforeEach(async () => {
  captureLogs();
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

async function registerPhone(token: string, role: 'owner' | 'member'): Promise<void> {
  const phone = await pairPhone(booted, role);
  const saved = await call(booted.base, phone.token, {
    method: 'PUT',
    path: '/api/push-targets',
    body: { token, platform: 'android' },
  });
  expect(saved.status).toBe(200);
}

describe('owner alerts', () => {
  it('reach owner phones only, never member phones', async () => {
    const saved = await call(booted.base, booted.owner, {
      method: 'PUT',
      path: '/api/settings/push',
      body: { serviceAccount: SERVICE_ACCOUNT },
    });
    expect(saved.status).toBe(200);
    await registerPhone('fcm-owner', 'owner');
    await registerPhone('fcm-member', 'member');
    const { clientId } = await register(booted.base);
    const { challenge } = pkce();
    await consentPage(booted.base, clientId, challenge);
    await vi.waitFor(async () => {
      const reply = await call(booted.base, booted.owner, {
        method: 'GET',
        path: API_ENDPOINTS.readPushStatus.path,
      });
      expect(API_ENDPOINTS.readPushStatus.response.parse(reply.body).sent).toBe(1);
    });
    expect(
      google.sent.map((sent) => /"token":"([^"]+)"/.exec(JSON.stringify(sent.body))?.[1]),
    ).toStrictEqual(['fcm-owner']);
  });
});
