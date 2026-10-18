import { request } from 'node:http';
import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PUBLIC_URL, pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: false });

const TUNNEL_HEADERS = [
  { 'cf-connecting-ip': '203.0.113.9' },
  { 'cf-ray': 'abc123-FRA' },
  { 'x-forwarded-for': '203.0.113.9' },
] as const;

async function ownerPerson(): Promise<string> {
  const listed = await call(suite.current.base, suite.current.owner, {
    method: 'GET',
    path: '/api/access/people',
  });
  const [first] = API_ENDPOINTS.listPersonAccess.response
    .parse(listed.body)
    .filter((access) => access.role === 'owner');
  if (first === undefined) throw new Error('the home has an owner person');
  return first.profile_id;
}

async function homeOnlyMember(): Promise<string> {
  await verifiedPublicUrl(suite.current);
  const phone = await pairPhone(suite.current);
  const changed = await call(suite.current.base, suite.current.owner, {
    method: 'PATCH',
    path: `/api/access/people/${phone.profileId ?? ''}`,
    body: { conditions: { home_only: true, schedule: null } },
  });
  expect(changed.status).toBe(200);
  return phone.token;
}

function listDevices(token: string, headers: Readonly<Record<string, string>>): Promise<number> {
  return call(suite.current.base, token, { method: 'GET', path: '/api/devices', headers }).then(
    (reply) => reply.status,
  );
}

function statusWithHost(token: string, host: string): Promise<number> {
  const { hostname, port } = new URL(suite.current.base);
  return new Promise((resolve, reject) => {
    const sent = request(
      { hostname, port, path: '/api/devices', headers: { host, authorization: `Bearer ${token}` } },
      (reply) => {
        reply.resume();
        resolve(reply.statusCode ?? 0);
      },
    );
    sent.on('error', reject);
    sent.end();
  });
}

describe('home_only when the hub sits behind the tunnel on loopback', () => {
  it('lets a home-only member in from the loopback without proxy markers', async () => {
    const token = await homeOnlyMember();
    expect(await listDevices(token, {})).toBe(200);
  });

  it.each(TUNNEL_HEADERS)('refuses the member when the request carries %o', async (headers) => {
    const token = await homeOnlyMember();
    expect(await listDevices(token, headers)).toBe(403);
  });

  it('refuses the member when the request names the public host', async () => {
    const token = await homeOnlyMember();
    expect(await statusWithHost(token, new URL(PUBLIC_URL).host)).toBe(403);
    expect(await statusWithHost(token, new URL(suite.current.base).host)).toBe(200);
  });

  it('keeps the read-only session answer for the member through the tunnel', async () => {
    const token = await homeOnlyMember();
    const reply = await call(suite.current.base, token, {
      method: 'GET',
      path: '/api/session',
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    });
    expect(reply.status).toBe(200);
  });

  it('never gates an owner device that names the public host', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current, 'owner', await ownerPerson());
    expect(await statusWithHost(phone.token, new URL(PUBLIC_URL).host)).toBe(200);
  });

  it.each(TUNNEL_HEADERS)('never gates an owner device that arrives with %o', async (headers) => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current, 'owner', await ownerPerson());
    expect(await listDevices(phone.token, headers)).toBe(200);
    expect(await listDevices(suite.current.owner, headers)).toBe(200);
  });
});
