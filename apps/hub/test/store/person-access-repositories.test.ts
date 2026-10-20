import { TEMPLATE_SCOPES } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreConflictError } from '../../src/store/sql';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let ownerPerson: string;
let desktopPerson: string;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const desktop = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  desktopPerson = opened.store.profiles.activeOf(desktop.id).id;
  ownerPerson = desktopPerson;
});

afterEach(async () => {
  await opened.close();
});

describe('person access repositories', () => {
  it('starts every created person as an adult member with explicit template scopes', () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    expect(store.personAccess.byProfile(sam.id)).toMatchObject({
      role: 'member',
      template: 'adult',
      scopes: TEMPLATE_SCOPES.adult,
      budget: null,
      expires_at: null,
    });
    expect(store.personAccess.byProfile(ownerPerson).role).toBe('owner');
  });

  it('changes scopes, budget and a guest end time and finds the next expiry', () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    const lee = store.profiles.create({ name: 'Lee' });
    store.personAccess.change(sam.id, {
      role: 'guest',
      template: 'guest',
      scopes: TEMPLATE_SCOPES.guest,
      budget: { daily_usd: 1, monthly_usd: null, warn_at_percent: 80, hard_stop: true },
      expires_at: '2026-10-19T10:00:00.000Z',
    });
    store.personAccess.change(lee.id, { expires_at: '2026-10-18T10:00:00.000Z' });
    expect(store.personAccess.byProfile(sam.id)).toMatchObject({
      role: 'guest',
      scopes: TEMPLATE_SCOPES.guest,
      budget: { daily_usd: 1, hard_stop: true },
    });
    expect(store.personAccess.nextExpiry('2026-10-01T00:00:00.000Z')).toBe(
      '2026-10-18T10:00:00.000Z',
    );
    expect(store.personAccess.nextExpiry('2026-10-18T10:00:00.000Z')).toBe(
      '2026-10-19T10:00:00.000Z',
    );
    expect(store.personAccess.expiredIds('2026-10-18T10:00:00.000Z')).toStrictEqual([lee.id]);
    store.personAccess.change(sam.id, { budget: null, expires_at: null });
    expect(store.personAccess.byProfile(sam.id)).toMatchObject({ budget: null, expires_at: null });
  });

  it('keeps at least one owner person, the desktop person an owner and owners without an end time', () => {
    const { store } = opened;
    expect(() => store.personAccess.change(ownerPerson, { role: 'member' })).toThrow(
      StoreConflictError,
    );
    expect(() => {
      store.profiles.remove(ownerPerson);
    }).toThrow(StoreConflictError);
    const partner = store.profiles.create({ name: 'Partner' });
    store.personAccess.change(partner.id, { role: 'owner', template: 'owner' });
    expect(() =>
      store.personAccess.change(partner.id, { expires_at: '2026-10-19T10:00:00.000Z' }),
    ).toThrow(StoreConflictError);
    expect(() => store.personAccess.change(desktopPerson, { role: 'guest' })).toThrow(
      StoreConflictError,
    );
    store.personAccess.change(partner.id, { role: 'member' });
    expect(store.personAccess.ownerIds()).toStrictEqual([ownerPerson]);
  });

  it('records and lists the audit newest first and forgets old events', () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    const first = store.accessAudit.record({
      profile_id: sam.id,
      client_id: null,
      kind: 'refused_scope',
      detail: 'device scope',
    });
    store.accessAudit.record({
      profile_id: null,
      client_id: null,
      kind: 'role_changed',
      detail: 'x',
    });
    expect(store.accessAudit.list(10).map((row) => row.kind)).toStrictEqual([
      'role_changed',
      'refused_scope',
    ]);
    expect(store.accessAudit.list(10, sam.id).map((row) => row.id)).toStrictEqual([first.id]);
  });

  it('takes a request through pending to a single decision', () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    const request = store.accessRequests.create(sam.id, {
      kind: 'area',
      target: 'health',
      note: 'for my run',
    });
    expect(request.status).toBe('pending');
    expect(store.accessRequests.list('pending')).toHaveLength(1);
    const decided = store.accessRequests.decide(request.id, ownerPerson, {
      approve: true,
      until: '2026-10-19T10:00:00.000Z',
      target: null,
    });
    expect(decided).toMatchObject({ status: 'approved', until: '2026-10-19T10:00:00.000Z' });
    expect(() =>
      store.accessRequests.decide(request.id, ownerPerson, {
        approve: false,
        until: null,
        target: null,
      }),
    ).toThrow(StoreConflictError);
    expect(store.accessRequests.list('pending')).toHaveLength(0);
    expect(store.accessRequests.list(undefined, sam.id)).toHaveLength(1);
  });

  it('names the target on approval and finds the grants whose end time has come once', () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    const open = store.accessRequests.create(sam.id, { kind: 'area', target: null, note: '' });
    const timed = store.accessRequests.decide(open.id, ownerPerson, {
      approve: true,
      until: '2026-10-19T10:00:00.000Z',
      target: 'health',
    });
    expect(timed.target).toBe('health');
    const forever = store.accessRequests.create(sam.id, { kind: 'area', target: 'home', note: '' });
    store.accessRequests.decide(forever.id, ownerPerson, {
      approve: true,
      until: null,
      target: null,
    });
    expect(store.accessRequests.nextLapse('2026-10-18T10:00:00.000Z')).toBe(
      '2026-10-19T10:00:00.000Z',
    );
    expect(store.accessRequests.lapsing('2026-10-19T09:59:59.000Z')).toStrictEqual([]);
    expect(
      store.accessRequests.lapsing('2026-10-19T10:00:00.000Z').map((row) => row.id),
    ).toStrictEqual([timed.id]);
    store.accessRequests.markLapsed(timed.id);
    expect(store.accessRequests.lapsing('2026-10-20T10:00:00.000Z')).toStrictEqual([]);
    expect(store.accessRequests.nextLapse('2026-10-18T10:00:00.000Z')).toBeUndefined();
    expect(store.accessRequests.byId(timed.id).lapsed_at).not.toBeNull();
  });

  it('binds a pairing to a person and gives the claimed device that person', () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    const owner = store.clients.owner();
    expect(owner).toBeDefined();
    store.clients.addPairing('h1', {
      role: 'member',
      createdBy: owner?.id ?? '',
      expiresAt: '2999-01-01T00:00:00.000Z',
      profileId: sam.id,
    });
    expect(store.clients.claimPairing('h1')).toStrictEqual({
      claimed: true,
      role: 'member',
      profileId: sam.id,
    });
    const phone = store.clients.create({
      name: 'Sam phone',
      platform: 'android',
      role: 'member',
      tokenHash: 'b',
      profileId: sam.id,
    });
    expect(store.profiles.activeOf(phone.id).id).toBe(sam.id);
  });
});
