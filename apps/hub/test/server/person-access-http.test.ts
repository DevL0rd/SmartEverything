import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: false });

async function owned(): Promise<string> {
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

async function audit(): Promise<string[]> {
  const listed = await call(suite.current.base, suite.current.owner, {
    method: 'GET',
    path: '/api/access/audit',
  });
  return API_ENDPOINTS.listAccessAudit.response.parse(listed.body).map((entry) => entry.kind);
}

async function auditDetails(): Promise<string[]> {
  const listed = await call(suite.current.base, suite.current.owner, {
    method: 'GET',
    path: '/api/access/audit',
  });
  return API_ENDPOINTS.listAccessAudit.response.parse(listed.body).map((entry) => entry.detail);
}

async function select(token: string, profileId: string): Promise<number> {
  return (
    await call(suite.current.base, token, {
      method: 'PUT',
      path: '/api/session/profile',
      body: { profileId },
    })
  ).status;
}

async function listClients(token: string): Promise<number> {
  return (await call(suite.current.base, token, { method: 'GET', path: '/api/clients' })).status;
}

describe('a paired member phone', () => {
  it('starts on its own person and cannot switch to the owner or anyone else', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const second = await pairPhone(suite.current);
    expect(phone.profileId).not.toBeNull();
    expect(phone.profileId).not.toBe(await owned());
    expect(phone.profileId).not.toBe(second.profileId);
    expect(await select(phone.token, await owned())).toBe(403);
    expect(await select(phone.token, second.profileId ?? '')).toBe(403);
    expect(await select(phone.token, phone.profileId ?? '')).toBe(200);
    expect(await audit()).toStrictEqual(['refused_scope', 'pairing_started', 'pairing_started']);
  });

  it('cannot read the owner’s data through the owner person even if a pairing names it', async () => {
    await verifiedPublicUrl(suite.current);
    const started = await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: '/api/pair/start',
      body: { role: 'member', profileId: await owned() },
    });
    expect(started.status).toBe(403);
  });
});

describe('an owner phone', () => {
  it('can act as another person with that person’s limits and switch back', async () => {
    await verifiedPublicUrl(suite.current);
    const kid = await pairPhone(suite.current);
    const owner = await pairPhone(suite.current, 'owner');
    expect(owner.profileId).toBe(await owned());
    expect(await listClients(owner.token)).toBe(200);
    expect(await select(owner.token, kid.profileId ?? '')).toBe(200);
    expect(await listClients(owner.token)).toBe(403);
    const session = await call(suite.current.base, owner.token, {
      method: 'GET',
      path: '/api/session',
    });
    expect(API_ENDPOINTS.session.response.parse(session.body).client.role).toBe('member');
    expect(await select(owner.token, await owned())).toBe(200);
    expect(await listClients(owner.token)).toBe(200);
  });
});

describe('revoking and ending access', () => {
  it('unpairs the devices of a revoked person at once', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const revoked = await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: `/api/access/people/${phone.profileId ?? ''}/revoke`,
    });
    expect(revoked.status).toBe(200);
    expect(
      (await call(suite.current.base, phone.token, { method: 'GET', path: '/api/session' })).status,
    ).toBe(401);
  });

  it('ends the access of a revoked person now and says so in plain words in the audit', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const profileId = phone.profileId ?? '';
    await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: `/api/access/people/${profileId}/revoke`,
    });
    const listed = await call(suite.current.base, suite.current.owner, {
      method: 'GET',
      path: '/api/access/people',
    });
    const revoked = API_ENDPOINTS.listPersonAccess.response
      .parse(listed.body)
      .find((access) => access.profile_id === profileId);
    expect(Date.parse(revoked?.expires_at ?? 'never')).toBeLessThanOrEqual(Date.now());
    expect(await auditDetails()).toContain(
      '1 device unpaired, 0 pairing codes withdrawn: revoked by an owner',
    );
  });

  it('names the changed fields in words, not field names', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    await call(suite.current.base, suite.current.owner, {
      method: 'PATCH',
      path: `/api/access/people/${phone.profileId ?? ''}`,
      body: { role: 'guest', expires_at: '2999-01-01T00:00:00.000Z' },
    });
    expect(await auditDetails()).toStrictEqual(
      expect.arrayContaining(['Role and end time changed']),
    );
  });

  it('refuses a guest whose end time has passed and accepts them again when it is extended', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const path = `/api/access/people/${phone.profileId ?? ''}`;
    const ended = await call(suite.current.base, suite.current.owner, {
      method: 'PATCH',
      path,
      body: { role: 'guest', template: 'guest', expires_at: '2020-01-01T00:00:00.000Z' },
    });
    expect(ended.status).toBe(200);
    const refused = await call(suite.current.base, phone.token, {
      method: 'GET',
      path: '/api/session',
    });
    expect(refused.status).toBe(403);
    await call(suite.current.base, suite.current.owner, {
      method: 'PATCH',
      path,
      body: { expires_at: '2999-01-01T00:00:00.000Z' },
    });
    expect(
      (await call(suite.current.base, phone.token, { method: 'GET', path: '/api/session' })).status,
    ).toBe(200);
    expect(await audit()).toContain('refused_expired');
  });

  it('refuses an owner role for a person who still has member devices', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const made = await call(suite.current.base, suite.current.owner, {
      method: 'PATCH',
      path: `/api/access/people/${phone.profileId ?? ''}`,
      body: { role: 'owner', template: 'owner' },
    });
    expect(made.status).toBe(409);
  });

  it('keeps member phones out of the access endpoints', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    for (const path of ['/api/access/people', '/api/access/audit']) {
      expect((await call(suite.current.base, phone.token, { method: 'GET', path })).status).toBe(
        403,
      );
    }
  });
});

describe('removing a person', () => {
  it('unpairs their member devices and moves owner devices to an owner person', async () => {
    await verifiedPublicUrl(suite.current);
    const kid = await pairPhone(suite.current);
    const owner = await pairPhone(suite.current, 'owner');
    expect(await select(owner.token, kid.profileId ?? '')).toBe(200);
    const removed = await call(suite.current.base, suite.current.owner, {
      method: 'DELETE',
      path: `/api/profiles/${kid.profileId ?? ''}`,
    });
    expect(removed.status).toBe(200);
    expect(
      (await call(suite.current.base, kid.token, { method: 'GET', path: '/api/session' })).status,
    ).toBe(401);
    const session = await call(suite.current.base, owner.token, {
      method: 'GET',
      path: '/api/session',
    });
    expect(API_ENDPOINTS.session.response.parse(session.body).client).toMatchObject({
      role: 'owner',
      profile_id: await owned(),
    });
  });
});

describe('the limits of a person', () => {
  it('are saved with the schedule and home-only conditions and read back', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const path = `/api/access/people/${phone.profileId ?? ''}`;
    const scopes = {
      areas: ['home'],
      devices: { mode: 'all', rooms: [], devices: [] },
      models: { mode: 'default', ids: [] },
      channels: { mode: 'all', ids: [] },
    };
    const owner = suite.current.owner;
    const saved = await call(suite.current.base, owner, {
      method: 'PATCH',
      path,
      body: {
        scopes,
        budget: { daily_usd: 2, monthly_usd: null, warn_at_percent: 80, hard_stop: true },
      },
    });
    expect(saved.status).toBe(200);
    const conditions = { home_only: true, schedule: { from: '01:00', to: '02:00', urgent: false } };
    const accepted = await call(suite.current.base, owner, {
      method: 'PATCH',
      path,
      body: { conditions },
    });
    expect(accepted.status).toBe(200);
    expect(API_ENDPOINTS.changePersonAccess.response.parse(accepted.body)).toMatchObject({
      scopes,
      budget: { daily_usd: 2, hard_stop: true },
      conditions,
    });
  });
});
