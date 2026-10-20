import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootServer, pairPhone, verifiedPublicUrl, type Booted } from './support/booted';
import { captureLogs } from './support/logs';
import { call, temporaryDirectory } from './support/server';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let phone: { token: string; clientId: string };

const PRE_ROLL = Buffer.from(new Int16Array(32_000).fill(4000).buffer).toString('base64');

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
  phone = await pairPhone(booted, 'member');
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function reportBattery(): Promise<void> {
  const reply = await call(booted.base, phone.token, {
    method: 'POST',
    path: '/api/nodes/self/report',
    body: { at: new Date().toISOString(), values: { battery: 80 }, events: [] },
  });
  expect(reply.status).toBe(200);
}

async function switchWakeOn(): Promise<void> {
  const view = await call(booted.base, phone.token, { method: 'GET', path: '/api/listening' });
  const [source] = E.readListening.response.parse(view.body).sources;
  expect(source?.kind).toBe('phone');
  const changed = await call(booted.base, phone.token, {
    method: 'PATCH',
    path: `/api/listening/sources/${source?.key ?? ''}`,
    body: { wake: true, power_mode: 'screen_on' },
  });
  expect(changed.status).toBe(200);
}

describe('the phone ear over HTTP', () => {
  it('gives a paired phone that has not reported yet its config and a phone device row', async () => {
    const before = await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' });
    expect(JSON.stringify(before.body)).not.toContain('"kind":"phone"');
    const reply = await call(booted.base, phone.token, {
      method: 'GET',
      path: '/api/listening/phone/config',
    });
    expect(reply.status).toBe(200);
    const after = await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' });
    expect(JSON.stringify(after.body)).toContain('"kind":"phone"');
  });

  it('gives a reporting phone its config, grants its first claim and accepts its reports', async () => {
    await reportBattery();
    const config = await call(booted.base, phone.token, {
      method: 'GET',
      path: '/api/listening/phone/config',
    });
    expect(config.status).toBe(200);
    expect(E.readPhoneListeningConfig.response.parse(config.body)).toMatchObject({
      wake: false,
      transcribe: false,
      power_mode: 'always',
    });
    await switchWakeOn();
    const claim = await call(booted.base, phone.token, {
      method: 'POST',
      path: '/api/listening/phone/claims',
      body: { phrase: 'hey coordinator', snippetDbfs: -18, preroll: PRE_ROLL },
    });
    expect(E.claimPhoneWake.response.parse(claim.body)).toEqual({ granted: true });
    const level = await call(booted.base, phone.token, {
      method: 'POST',
      path: '/api/listening/phone/reports',
      body: { kind: 'state', state: null },
    });
    expect(level.status).toBe(200);
  });
});
