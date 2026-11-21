import { TEMPLATE_SCOPES, type PersonAccessChange, type ProfileRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OwnerAlerts } from '../../src/extensions/owner-alerts';
import { AccessRequests } from '../../src/server/access-requests';
import { StoreConflictError } from '../../src/store/sql';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-18T10:00:00.000Z';
const UNTIL = '2026-10-18T12:00:00.000Z';
const WITHOUT_SETTINGS = TEMPLATE_SCOPES.child.areas;
const BUDGET = { daily_usd: 1, monthly_usd: 10, warn_at_percent: 80, hard_stop: true };

let moment = new Date(START);
let opened: TestStore;
let requests: AccessRequests;
let owner: string;

beforeEach(async () => {
  captureLogs();
  moment = new Date(START);
  opened = await testStore((): Date => moment);
  requests = new AccessRequests({
    store: opened.store,
    alerts: new OwnerAlerts(),
    now: (): Date => moment,
    scopesChanged: (): void => undefined,
  });
  const boss = opened.store.profiles.create({ name: 'Boss' });
  opened.store.personAccess.change(boss.id, { role: 'owner', template: 'owner' });
  owner = opened.store.clients.create({
    name: 'Boss phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'hash-boss',
    profileId: boss.id,
  }).id;
});

afterEach(async () => {
  await opened.close();
});

function kid(): ProfileRow {
  const profile = opened.store.profiles.create({ name: 'Kid' });
  opened.store.personAccess.change(profile.id, {
    role: 'member',
    template: 'adult',
    scopes: { ...TEMPLATE_SCOPES.adult, areas: WITHOUT_SETTINGS },
    budget: BUDGET,
  });
  return profile;
}

async function byHand(profileId: string, change: PersonAccessChange): Promise<void> {
  await requests.changeByOwner(profileId, change);
}

async function timedBudget(profileId: string): Promise<string> {
  const row = await requests.create(profileId, { kind: 'budget', target: '5', note: '' });
  await requests.decide(row.id, owner, { approve: true, until: UNTIL, target: null });
  return row.id;
}

function budgetOf(profileId: string): unknown {
  return opened.store.personAccess.byProfile(profileId).budget;
}

describe('the target a person asked for', () => {
  it('is kept when the owner denies with a different target', async () => {
    const person = kid();
    const row = await requests.create(person.id, { kind: 'area', target: 'settings', note: '' });
    await expect(
      requests.decide(row.id, owner, { approve: false, until: null, target: 'cameras' }),
    ).rejects.toThrow(/already names its target/u);
    const denied = await requests.decide(row.id, owner, {
      approve: false,
      until: null,
      target: null,
    });
    expect(denied).toMatchObject({ status: 'denied', target: 'settings' });
  });

  it('cannot be swapped by a decision written straight to the store', async () => {
    const person = kid();
    const row = await requests.create(person.id, { kind: 'area', target: 'settings', note: '' });
    expect(() =>
      opened.store.accessRequests.decide(row.id, owner, {
        approve: true,
        until: null,
        target: 'cameras',
      }),
    ).toThrow(StoreConflictError);
    expect(opened.store.accessRequests.byId(row.id)).toMatchObject({
      status: 'pending',
      target: 'settings',
    });
  });
});

describe('a timed grant next to what the owner set by hand', () => {
  it('leaves an AI budget the owner set by hand alone when it ends', async () => {
    const person = kid();
    const id = await timedBudget(person.id);
    expect(budgetOf(person.id)).toMatchObject({ daily_usd: 6, monthly_usd: 15 });
    await byHand(person.id, { budget: { ...BUDGET, daily_usd: 20, monthly_usd: 50 } });
    expect(opened.store.accessRequests.byId(id).lapsed_at).toBe(START);
    expect(opened.store.accessRequests.nextLapse(START)).toBeUndefined();
    moment = new Date(UNTIL);
    expect(await requests.lapse()).toStrictEqual([]);
    expect(budgetOf(person.id)).toMatchObject({ daily_usd: 20, monthly_usd: 50 });
    expect(opened.store.accessAudit.list(10, person.id)[0]?.detail).toContain(
      'Replaced by the AI budget the owner set',
    );
  });

  it('still takes back its amount when the owner changed only the warning level', async () => {
    const person = kid();
    await timedBudget(person.id);
    await byHand(person.id, {
      budget: { ...BUDGET, daily_usd: 6, monthly_usd: 15, warn_at_percent: 50 },
    });
    moment = new Date(UNTIL);
    expect(await requests.lapse()).toStrictEqual([person.id]);
    expect(budgetOf(person.id)).toMatchObject({
      daily_usd: 1,
      monthly_usd: 10,
      warn_at_percent: 50,
    });
  });

  it('keeps an area the owner saved by hand through the access change', async () => {
    const person = kid();
    const row = await requests.create(person.id, { kind: 'area', target: 'settings', note: '' });
    await requests.decide(row.id, owner, { approve: true, until: UNTIL, target: null });
    await byHand(person.id, { scopes: opened.store.personAccess.byProfile(person.id).scopes });
    moment = new Date(UNTIL);
    expect(await requests.lapse()).toStrictEqual([]);
    expect(opened.store.personAccess.byProfile(person.id).scopes.areas).toContain('settings');
  });
});
