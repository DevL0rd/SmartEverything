import {
  ApiError,
  type AccessAuditRow,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  type ClientRow,
  type PersonAccessChange,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessService } from '../../src/server/access';
import { AccessLifecycle } from '../../src/server/access-lifecycle';
import { clientForToken } from '../../src/server/auth';
import { assertMayChoosePerson } from '../../src/server/person-access';
import { accessServiceFor } from '../support/access-service';
import { testStore, type TestStore } from '../support/store';

const HOME = { remote: '192.168.1.20', forwarded: false, host: null, statusOnly: false } as const;
const AWAY = { remote: '203.0.113.9', forwarded: false, host: null, statusOnly: false } as const;
const START = new Date('2026-10-18T10:00:00.000Z');

let opened: TestStore;
let moment: Date;
let ownerPerson: string;

function pair(
  role: 'owner' | 'member',
  profileId: string,
  name = 'Phone',
): { readonly token: string; readonly client: ClientRow } {
  const token = createClientToken();
  const client = opened.store.clients.create({
    name,
    platform: 'android',
    role,
    tokenHash: hashClientToken(token),
    profileId,
  });
  return { token, client };
}

function person(name: string, change: PersonAccessChange): ProfileRow {
  const profile = opened.store.profiles.create({ name });
  opened.store.personAccess.change(profile.id, change);
  return profile;
}

function desktop(): ClientRow {
  const owner = opened.store.clients.owner();
  if (owner === undefined) throw new Error('the desktop owner exists');
  return owner;
}

function audits(limit: number): Promise<AccessAuditRow[]> {
  return opened.store.host.call('accessAudit', 'list', limit);
}

async function refusedAsync(work: () => Promise<unknown>): Promise<ApiError> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

beforeEach(async () => {
  moment = START;
  opened = await testStore((): Date => moment);
  const created = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  ownerPerson = opened.store.profiles.activeOf(created.id).id;
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

describe('the owner and the existing owner devices', () => {
  it('get exactly the stored client row, with owner power, from any route', async () => {
    const phones = Array.from({ length: 4 }, (_, index) =>
      pair('owner', ownerPerson, `Phone ${String(index)}`),
    );
    for (const phone of phones) {
      for (const entry of [HOME, AWAY]) {
        const stored = opened.store.clients.byId(phone.client.id);
        const resolved = await clientForToken(opened.store, phone.token, entry);
        expect(resolved).toStrictEqual(stored);
        expect(resolved.role).toBe('owner');
      }
    }
    expect(await audits(10)).toStrictEqual([]);
  });
});

describe('the effective role', () => {
  it('limits an owner device that acts as a member person, and lets it switch back', async () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('owner', ownerPerson);
    opened.store.clients.useProfile(phone.client.id, kid.id);
    expect((await clientForToken(opened.store, phone.token, AWAY)).role).toBe('member');
    await assertMayChoosePerson(opened.store, phone.client.id, ownerPerson);
    opened.store.clients.useProfile(phone.client.id, ownerPerson);
    expect((await clientForToken(opened.store, phone.token, AWAY)).role).toBe('owner');
  });

  it('keeps a member device a member even on a person who is an owner', async () => {
    const phone = pair('member', ownerPerson);
    expect((await clientForToken(opened.store, phone.token, HOME)).role).toBe('member');
  });
});

describe('switching person', () => {
  it('is refused for a member device, recorded in the audit, and allowed for its own person', async () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('member', kid.id);
    const error = await refusedAsync(() =>
      assertMayChoosePerson(opened.store, phone.client.id, ownerPerson),
    );
    expect(error.code).toBe('forbidden');
    expect(await audits(10)).toMatchObject([
      { kind: 'refused_scope', client_id: phone.client.id, profile_id: kid.id },
    ]);
    await assertMayChoosePerson(opened.store, phone.client.id, kid.id);
  });
});

describe('pairing', () => {
  let access: AccessService;
  let owner: ClientRow;

  beforeEach(() => {
    owner = desktop();
    access = accessServiceFor(opened, (): Date => moment);
  });

  async function claimed(code: string): Promise<ClientRow> {
    return (await access.claim({ code, name: 'Pixel 9', platform: 'android', remote: 'phone' }))
      .client;
  }

  async function codeOf(role: 'owner' | 'member', profileId?: string): Promise<string> {
    return (await access.startPairing(role, owner.id, profileId)).code;
  }

  it('puts a new member device on a new member person named after it, never on the owner', async () => {
    const client = await claimed(await codeOf('member'));
    expect(client.profile_id).not.toBe(ownerPerson);
    const created = opened.store.profiles.byId(client.profile_id ?? '');
    expect(created.name).toBe('Pixel 9');
    expect(opened.store.personAccess.byProfile(created.id)).toMatchObject({ role: 'member' });
    expect(await audits(5)).toMatchObject([{ kind: 'pairing_started' }]);
  });

  it('binds a pairing to the named member person and refuses an owner person', async () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    expect((await claimed(await codeOf('member', kid.id))).profile_id).toBe(kid.id);
    expect((await refusedAsync(() => codeOf('member', ownerPerson))).code).toBe('forbidden');
    expect((await refusedAsync(() => codeOf('owner', kid.id))).code).toBe('forbidden');
  });

  it('puts an owner device on an owner person', async () => {
    const client = await claimed(await codeOf('owner'));
    expect(client.profile_id).toBe(ownerPerson);
  });

  it('refuses a person whose access has ended, and a person who became an owner after the code was made', async () => {
    const guest = person('Guest', {
      role: 'guest',
      template: 'guest',
      expires_at: '2026-10-18T09:00:00.000Z',
    });
    expect((await refusedAsync(() => codeOf('member', guest.id))).code).toBe('conflict');
    const kid = person('Kid', { role: 'member', template: 'child' });
    const code = await codeOf('member', kid.id);
    opened.store.personAccess.change(kid.id, { role: 'owner' });
    expect((await refusedAsync(() => claimed(code))).code).toBe('conflict');
  });
});

describe('guests', () => {
  it('are refused after the end time and the refusal is audited once', async () => {
    const guest = person('Guest', {
      role: 'guest',
      template: 'guest',
      expires_at: '2026-10-18T12:00:00.000Z',
    });
    const phone = pair('member', guest.id);
    expect((await clientForToken(opened.store, phone.token, HOME)).role).toBe('member');
    moment = new Date('2026-10-18T12:00:00.000Z');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await refusedAsync(() => clientForToken(opened.store, phone.token, HOME))).code).toBe(
        'forbidden',
      );
    }
    expect(await audits(10)).toMatchObject([
      { kind: 'refused_expired', client_id: phone.client.id },
    ]);
  });

  it('do not lock out an owner device that is only looking at the expired person', async () => {
    const guest = person('Guest', {
      role: 'guest',
      template: 'guest',
      expires_at: '2026-10-18T09:00:00.000Z',
    });
    const phone = pair('owner', guest.id);
    expect((await clientForToken(opened.store, phone.token, AWAY)).role).toBe('member');
  });

  it('are unpaired by one timer at the end time while owner devices stay, and a later end time re-arms it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const withdrawn: string[] = [];
    const lifecycle = new AccessLifecycle({
      store: opened.store,
      now: (): Date => new Date(Date.now()),
      clientRemoved: (id): void => {
        withdrawn.push(id);
      },
      clientPaused: (): void => undefined,
      lapseGrants: (): Promise<void> => Promise.resolve(),
    });
    const guest = person('Guest', {
      role: 'guest',
      template: 'guest',
      expires_at: '2026-10-18T11:00:00.000Z',
    });
    const device = pair('member', guest.id);
    const viewer = pair('owner', guest.id);
    lifecycle.start();
    await lifecycle.idle();
    opened.store.personAccess.change(guest.id, { expires_at: '2026-10-18T13:00:00.000Z' });
    lifecycle.arm();
    await lifecycle.idle();
    vi.advanceTimersByTime(2 * 60 * 60_000);
    await lifecycle.idle();
    expect(withdrawn).toStrictEqual([]);
    vi.advanceTimersByTime(60 * 60_000);
    await lifecycle.idle();
    expect(withdrawn).toStrictEqual([device.client.id]);
    expect(opened.store.clients.list().map((client) => client.id)).toContain(viewer.client.id);
    expect(opened.store.clients.list().map((client) => client.id)).not.toContain(device.client.id);
    expect(await audits(5)).toMatchObject([{ kind: 'person_revoked' }]);
    lifecycle.stop();
  });

  it('stay quiet at startup when an old end time has no devices left', async () => {
    const lifecycle = new AccessLifecycle({
      store: opened.store,
      now: (): Date => moment,
      clientRemoved: (): void => undefined,
      clientPaused: (): void => undefined,
      lapseGrants: (): Promise<void> => Promise.resolve(),
    });
    person('Guest', { role: 'guest', template: 'guest', expires_at: '2026-10-18T09:00:00.000Z' });
    lifecycle.start();
    await lifecycle.idle();
    expect(await audits(5)).toStrictEqual([]);
    lifecycle.stop();
  });
});

describe('revoking a person', () => {
  it('unpairs the member devices at once, stops their tokens and keeps the person', async () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('member', kid.id);
    const other = pair('member', kid.id, 'Tablet');
    const lifecycle = new AccessLifecycle({
      store: opened.store,
      now: (): Date => moment,
      clientRemoved: (): void => undefined,
      clientPaused: (): void => undefined,
      lapseGrants: (): Promise<void> => Promise.resolve(),
    });
    const owner = desktop();
    expect(await lifecycle.revoke(kid.id, owner.id)).toBe(2);
    for (const device of [phone, other]) {
      expect(
        (await refusedAsync(() => clientForToken(opened.store, device.token, HOME))).code,
      ).toBe('unauthorized');
    }
    expect(opened.store.profiles.byId(kid.id).name).toBe('Kid');
    expect(await audits(5)).toMatchObject([
      { kind: 'person_revoked', client_id: owner.id, profile_id: kid.id },
    ]);
  });
});

describe('home-only conditions', () => {
  const conditions = { home_only: true, schedule: null };

  it('refuse a member device over the public route and let the home network and this computer in', async () => {
    const kid = person('Kid', { role: 'member', template: 'child', conditions });
    const phone = pair('member', kid.id);
    expect((await refusedAsync(() => clientForToken(opened.store, phone.token, AWAY))).code).toBe(
      'forbidden',
    );
    expect(await audits(5)).toMatchObject([
      { kind: 'refused_condition', client_id: phone.client.id },
    ]);
    expect((await clientForToken(opened.store, phone.token, HOME)).id).toBe(phone.client.id);
    expect(
      (await clientForToken(opened.store, phone.token, { ...HOME, remote: '::ffff:127.0.0.1' })).id,
    ).toBe(phone.client.id);
  });

  it('treat a Host header that cannot be read as away instead of failing', async () => {
    const kid = person('Kid', { role: 'member', template: 'child', conditions });
    const phone = pair('member', kid.id);
    const refused = await refusedAsync(() =>
      clientForToken(opened.store, phone.token, { ...HOME, host: 'not a host' }),
    );
    expect(refused.code).toBe('forbidden');
  });

  it('keep the read-only status of the session visible away from home', async () => {
    const kid = person('Kid', { role: 'member', template: 'child', conditions });
    const phone = pair('member', kid.id);
    expect(
      (await clientForToken(opened.store, phone.token, { ...AWAY, statusOnly: true })).role,
    ).toBe('member');
  });

  it('never bind an owner person or an owner device acting as the person', async () => {
    const owner = pair('owner', ownerPerson);
    opened.store.personAccess.change(ownerPerson, { conditions });
    expect((await clientForToken(opened.store, owner.token, AWAY)).role).toBe('owner');
    const kid = person('Kid', { role: 'member', template: 'child', conditions });
    opened.store.clients.useProfile(owner.client.id, kid.id);
    expect((await clientForToken(opened.store, owner.token, AWAY)).role).toBe('member');
  });

  it('start from the template scopes so the contract the guards rely on is explicit', () => {
    expect(TEMPLATE_SCOPES.child.areas).not.toContain('settings');
  });
});

describe('a schedule that starts', () => {
  it('reconnects the member devices of the paused person once at the start and leaves owner devices', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const paused: string[] = [];
    const lifecycle = new AccessLifecycle({
      store: opened.store,
      now: (): Date => new Date(Date.now()),
      clientRemoved: (): void => undefined,
      clientPaused: (id): void => {
        paused.push(id);
      },
      lapseGrants: (): Promise<void> => Promise.resolve(),
    });
    const kid = person('Kid', {
      role: 'member',
      template: 'child',
      conditions: { home_only: false, schedule: { from: '12:00', to: '13:00', urgent: false } },
    });
    const phone = pair('member', kid.id);
    const viewer = pair('owner', kid.id, 'Owner phone');
    lifecycle.start();
    await lifecycle.idle();
    vi.advanceTimersByTime(119 * 60_000);
    await lifecycle.idle();
    expect(paused).toStrictEqual([]);
    vi.advanceTimersByTime(2 * 60_000);
    await lifecycle.idle();
    expect(paused).toStrictEqual([phone.client.id]);
    expect(paused).not.toContain(viewer.client.id);
    vi.advanceTimersByTime(60 * 60_000);
    await lifecycle.idle();
    expect(paused).toStrictEqual([phone.client.id]);
    vi.advanceTimersByTime(23 * 60 * 60_000);
    await lifecycle.idle();
    expect(paused).toStrictEqual([phone.client.id, phone.client.id]);
    lifecycle.stop();
  });
});
