import {
  API_ENDPOINTS,
  MCP_TOOL_AREAS,
  TEMPLATE_SCOPES,
  type AccessRequestRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: false });

async function withoutDevices(): Promise<{ token: string; profileId: string }> {
  await verifiedPublicUrl(suite.current);
  const phone = await pairPhone(suite.current);
  if (phone.profileId === null) throw new Error('a paired member phone has a person');
  const changed = await call(suite.current.base, suite.current.owner, {
    method: 'PATCH',
    path: `/api/access/people/${phone.profileId}`,
    body: {
      scopes: {
        ...TEMPLATE_SCOPES.adult,
        areas: MCP_TOOL_AREAS.filter((area) => area !== 'devices'),
      },
    },
  });
  expect(changed.status).toBe(200);
  return { token: phone.token, profileId: phone.profileId };
}

function ask(token: string, body: unknown): ReturnType<typeof call> {
  return call(suite.current.base, token, { method: 'POST', path: '/api/access/requests', body });
}

function decide(token: string, id: string, body: unknown): ReturnType<typeof call> {
  return call(suite.current.base, token, {
    method: 'POST',
    path: `/api/access/requests/${id}/decision`,
    body,
  });
}

async function listed(token: string): Promise<AccessRequestRow[]> {
  const answer = await call(suite.current.base, token, {
    method: 'GET',
    path: '/api/access/requests',
  });
  return API_ENDPOINTS.listAccessRequests.response.parse(answer.body);
}

describe('asking the owner for more access', () => {
  it('lets a person ask even without the system area, shows the owner every request and a person only theirs', async () => {
    const kid = await withoutDevices();
    const other = await pairPhone(suite.current);
    const made = await ask(kid.token, { kind: 'area', target: 'devices', note: 'for the lamp' });
    expect(made.status).toBe(200);
    expect((await listed(kid.token)).map((row) => row.profile_id)).toStrictEqual([kid.profileId]);
    expect(await listed(other.token)).toStrictEqual([]);
    expect(await listed(suite.current.owner)).toHaveLength(1);
  });

  it('keeps the decision with the owner and widens the limits at once on approval', async () => {
    const kid = await withoutDevices();
    const devices = (): ReturnType<typeof call> =>
      call(suite.current.base, kid.token, { method: 'GET', path: '/api/devices' });
    expect((await devices()).status).toBe(403);
    const made = API_ENDPOINTS.createAccessRequest.response.parse(
      (await ask(kid.token, { kind: 'area', target: 'devices', note: '' })).body,
    );
    const body = { approve: true, until: null };
    expect((await decide(kid.token, made.id, body)).status).toBe(403);
    expect((await devices()).status).toBe(403);
    const approved = await decide(suite.current.owner, made.id, body);
    expect(approved.status).toBe(200);
    expect(API_ENDPOINTS.decideAccessRequest.response.parse(approved.body).status).toBe('approved');
    expect((await devices()).status).toBe(200);
    expect((await decide(suite.current.owner, made.id, body)).status).toBe(409);
  });
});
