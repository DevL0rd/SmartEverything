import {
  ApiError,
  TEMPLATE_SCOPES,
  type AccessScopes,
  type DeviceRow,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OwnerAlerts, type OwnerAlert } from '../../src/extensions/owner-alerts';
import { AccessRequests } from '../../src/server/access-requests';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-18T10:00:00.000Z';
const UNTIL = '2026-10-18T12:00:00.000Z';
const WITHOUT_SETTINGS = TEMPLATE_SCOPES.child.areas;

let moment = new Date(START);
let opened: TestStore;
let raised: OwnerAlert[];
let changedFor: string[];
let requests: AccessRequests;

beforeEach(async () => {
  captureLogs();
  moment = new Date(START);
  opened = await testStore((): Date => moment);
  raised = [];
  changedFor = [];
  const alerts = new OwnerAlerts();
  alerts.listen((alert) => {
    raised.push(alert);
  });
  requests = new AccessRequests({
    store: opened.store,
    alerts,
    now: (): Date => moment,
    scopesChanged: (profileId): void => {
      changedFor.push(profileId);
    },
  });
});

afterEach(async () => {
  await opened.close();
});

function person(
  name: string,
  scopes: Partial<AccessScopes>,
  role: 'owner' | 'member' = 'member',
): ProfileRow {
  const profile = opened.store.profiles.create({ name });
  opened.store.personAccess.change(profile.id, {
    role,
    template: role === 'owner' ? 'owner' : 'adult',
    scopes: { ...TEMPLATE_SCOPES.adult, ...scopes },
  });
  return profile;
}

function ownerPhone(): string {
  return opened.store.clients.create({
    name: 'Boss phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'hash-boss',
    profileId: person('Boss', {}, 'owner').id,
  }).id;
}

async function refusal(work: () => Promise<unknown>): Promise<ApiError> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

function areasOf(profileId: string): readonly string[] {
  return opened.store.personAccess.byProfile(profileId).scopes.areas;
}

function lampIn(room: string): DeviceRow {
  const [lamp] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'lamp',
      parentId: null,
      kind: 'light',
      name: 'Hall lamp',
      model: 'model.one',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId: room,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (lamp === undefined) throw new Error('the lamp was stored');
  return lamp;
}

describe('asking the owner for more', () => {
  it('stores the request and tells the owners at once', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, {
      kind: 'area',
      target: 'settings',
      note: 'for the lamp',
    });
    expect(row).toMatchObject({ status: 'pending', profile_id: kid.id, target: 'settings' });
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      title: 'Kid asks for more access',
      body: 'for the lamp',
      data: { kind: 'access_request', requestId: row.id },
    });
    expect(raised[0]?.person).toBeUndefined();
  });

  it('refuses an owner, a request for what they hold and a repeat of a pending request', async () => {
    const boss = person('Boss', {}, 'owner');
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const owner = await refusal(() =>
      requests.create(boss.id, { kind: 'area', target: 'home', note: '' }),
    );
    expect(owner.message).toContain('already has everything');
    const held = await refusal(() =>
      requests.create(kid.id, { kind: 'area', target: 'home', note: '' }),
    );
    expect(held.message).toContain('already have that');
    await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    const again = await refusal(() =>
      requests.create(kid.id, { kind: 'area', target: 'settings', note: 'again' }),
    );
    expect(again.message).toContain('already asked');
  });

  it('refuses an area that does not exist and a budget request without a budget', async () => {
    const kid = person('Kid', {});
    const area = await refusal(() =>
      requests.create(kid.id, { kind: 'area', target: 'attic', note: '' }),
    );
    expect(area.code).toBe('invalid_request');
    const budget = await refusal(() =>
      requests.create(kid.id, { kind: 'budget', target: '5', note: '' }),
    );
    expect(budget.message).toContain('no AI budget');
  });

  it('lists everything for the owner and only their own for a person', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const other = person('Other', { areas: WITHOUT_SETTINGS });
    await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    await requests.create(other.id, { kind: 'area', target: 'settings', note: '' });
    expect(await requests.list(null)).toHaveLength(2);
    expect((await requests.list(kid.id)).map((row) => row.profile_id)).toStrictEqual([kid.id]);
  });
});

describe('deciding a request', () => {
  it('widens the limits at once on approval and tells the person', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    raised = [];
    const decided = await requests.decide(row.id, ownerPhone(), {
      approve: true,
      until: null,
      target: null,
    });
    expect(decided).toMatchObject({ status: 'approved', until: null, lapsed_at: null });
    expect(areasOf(kid.id)).toContain('settings');
    expect(changedFor).toStrictEqual([kid.id]);
    expect(raised[0]).toMatchObject({ title: 'Your request was approved', person: kid.id });
    expect(opened.store.accessAudit.list(10, kid.id).map((entry) => entry.kind)).toContain(
      'scopes_changed',
    );
  });

  it('leaves the limits alone on a denial and refuses a second decision', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    const by = ownerPhone();
    const denied = await requests.decide(row.id, by, { approve: false, until: null, target: null });
    expect(denied.status).toBe('denied');
    expect(areasOf(kid.id)).not.toContain('settings');
    expect(raised.at(-1)).toMatchObject({ title: 'Your request was denied' });
    await expect(
      requests.decide(row.id, by, { approve: true, until: null, target: null }),
    ).rejects.toThrow(/already denied/u);
  });

  it('needs a target, which the owner can name when approving', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, {
      kind: 'area',
      target: null,
      note: 'the settings page',
    });
    const by = ownerPhone();
    const missing = await refusal(() =>
      requests.decide(row.id, by, { approve: true, until: null, target: null }),
    );
    expect(missing.code).toBe('invalid_request');
    const decided = await requests.decide(row.id, by, {
      approve: true,
      until: null,
      target: 'settings',
    });
    expect(decided.target).toBe('settings');
    expect(areasOf(kid.id)).toContain('settings');
  });

  it('keeps the target the person named and refuses a different one', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    const by = ownerPhone();
    const swapped = await refusal(() =>
      requests.decide(row.id, by, { approve: true, until: null, target: 'cameras' }),
    );
    expect(swapped.code).toBe('invalid_request');
    expect(opened.store.accessRequests.byId(row.id)).toMatchObject({
      status: 'pending',
      target: 'settings',
    });
    const decided = await requests.decide(row.id, by, {
      approve: true,
      until: null,
      target: 'settings',
    });
    expect(decided.target).toBe('settings');
  });

  it('refuses an end time that has already passed', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    const past = '2026-10-18T09:00:00.000Z';
    const refused = await refusal(() =>
      requests.decide(row.id, ownerPhone(), { approve: true, until: past, target: null }),
    );
    expect(refused.code).toBe('invalid_request');
    expect(opened.store.accessRequests.byId(row.id).status).toBe('pending');
  });

  it('gives a device to a person limited to listed devices and refuses an unknown one', async () => {
    const room = opened.store.rooms.create('Hall', 0).id;
    const lamp = lampIn(room);
    const kid = person('Kid', { devices: { mode: 'only', rooms: [], devices: [] } });
    const row = await requests.create(kid.id, { kind: 'device', target: lamp.id, note: '' });
    await requests.decide(row.id, ownerPhone(), { approve: true, until: null, target: null });
    expect(opened.store.personAccess.byProfile(kid.id).scopes.devices.devices).toStrictEqual([
      lamp.id,
    ]);
    const unknown = await refusal(() =>
      requests.create(kid.id, {
        kind: 'device',
        target: '00000000-0000-4000-8000-000000000000',
        note: '',
      }),
    );
    expect(unknown.code).toBe('not_found');
  });

  it('raises the daily and monthly AI budget', async () => {
    const kid = person('Kid', {});
    opened.store.personAccess.change(kid.id, {
      budget: { daily_usd: 1, monthly_usd: 10, warn_at_percent: 80, hard_stop: true },
    });
    const row = await requests.create(kid.id, { kind: 'budget', target: '4', note: '' });
    await requests.decide(row.id, ownerPhone(), { approve: true, until: null, target: null });
    expect(opened.store.personAccess.byProfile(kid.id).budget).toMatchObject({
      daily_usd: 5,
      monthly_usd: 14,
    });
  });
});

describe('a grant with an end time', () => {
  it('is taken back when the end time comes, once, and the person is reconnected', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    await requests.decide(row.id, ownerPhone(), { approve: true, until: UNTIL, target: null });
    expect(opened.store.accessRequests.nextLapse(moment.toISOString())).toBe(UNTIL);
    expect(await requests.lapse()).toStrictEqual([]);
    moment = new Date(UNTIL);
    changedFor = [];
    expect(await requests.lapse()).toStrictEqual([kid.id]);
    expect(areasOf(kid.id)).not.toContain('settings');
    expect(opened.store.accessRequests.byId(row.id).lapsed_at).toBe(UNTIL);
    expect(changedFor).toStrictEqual([kid.id]);
    expect(await requests.lapse()).toStrictEqual([]);
    expect(opened.store.accessAudit.list(10, kid.id)[0]?.detail).toContain(
      'Temporary access ended',
    );
  });

  it('does not take back what a second, permanent approval still grants', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const by = ownerPhone();
    const first = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    await requests.decide(first.id, by, { approve: true, until: UNTIL, target: null });
    opened.store.personAccess.change(kid.id, {
      scopes: { ...opened.store.personAccess.byProfile(kid.id).scopes, areas: WITHOUT_SETTINGS },
    });
    const second = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    await requests.decide(second.id, by, { approve: true, until: null, target: null });
    moment = new Date(UNTIL);
    expect(await requests.lapse()).toStrictEqual([]);
    expect(areasOf(kid.id)).toContain('settings');
  });

  it('takes back each timed budget grant by its own amount', async () => {
    const kid = person('Kid', {});
    opened.store.personAccess.change(kid.id, {
      budget: { daily_usd: 1, monthly_usd: 10, warn_at_percent: 80, hard_stop: true },
    });
    const by = ownerPhone();
    for (let asked = 0; asked < 2; asked += 1) {
      const row = await requests.create(kid.id, { kind: 'budget', target: '5', note: '' });
      await requests.decide(row.id, by, { approve: true, until: UNTIL, target: null });
    }
    expect(opened.store.personAccess.byProfile(kid.id).budget).toMatchObject({
      daily_usd: 11,
      monthly_usd: 20,
    });
    moment = new Date(UNTIL);
    changedFor = [];
    await requests.lapse();
    expect(changedFor).toStrictEqual([kid.id]);
    expect(opened.store.personAccess.byProfile(kid.id).budget).toMatchObject({
      daily_usd: 1,
      monthly_usd: 10,
    });
  });

  it('takes back a timed budget grant that sits next to a permanent one', async () => {
    const kid = person('Kid', {});
    opened.store.personAccess.change(kid.id, {
      budget: { daily_usd: 1, monthly_usd: 10, warn_at_percent: 80, hard_stop: true },
    });
    const by = ownerPhone();
    const timed = await requests.create(kid.id, { kind: 'budget', target: '5', note: '' });
    await requests.decide(timed.id, by, { approve: true, until: UNTIL, target: null });
    const permanent = await requests.create(kid.id, { kind: 'budget', target: '5', note: '' });
    await requests.decide(permanent.id, by, { approve: true, until: null, target: null });
    moment = new Date(UNTIL);
    expect(await requests.lapse()).toStrictEqual([kid.id]);
    expect(opened.store.personAccess.byProfile(kid.id).budget).toMatchObject({
      daily_usd: 6,
      monthly_usd: 15,
    });
  });

  it('keeps a timed grant the owner then saved by hand', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    await requests.decide(row.id, ownerPhone(), { approve: true, until: UNTIL, target: null });
    await requests.changeByOwner(kid.id, {
      scopes: opened.store.personAccess.byProfile(kid.id).scopes,
    });
    expect(opened.store.accessRequests.byId(row.id).until).toBeNull();
    expect(opened.store.accessRequests.nextLapse(moment.toISOString())).toBeUndefined();
    moment = new Date(UNTIL);
    expect(await requests.lapse()).toStrictEqual([]);
    expect(areasOf(kid.id)).toContain('settings');
  });

  it('keeps a timed device grant when the owner has since granted its whole room', async () => {
    const room = opened.store.rooms.create('Hall', 0).id;
    const lamp = lampIn(room);
    const kid = person('Kid', { devices: { mode: 'only', rooms: [], devices: [] } });
    const row = await requests.create(kid.id, { kind: 'device', target: lamp.id, note: '' });
    await requests.decide(row.id, ownerPhone(), { approve: true, until: UNTIL, target: null });
    const { devices } = opened.store.personAccess.byProfile(kid.id).scopes;
    await requests.changeByOwner(kid.id, {
      scopes: {
        ...opened.store.personAccess.byProfile(kid.id).scopes,
        devices: { ...devices, rooms: [room] },
      },
    });
    moment = new Date(UNTIL);
    expect(await requests.lapse()).toStrictEqual([]);
    expect(opened.store.personAccess.byProfile(kid.id).scopes.devices).toMatchObject({
      rooms: [room],
    });
  });

  it('does not keep a timed grant the owner has since taken away by hand', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    await requests.decide(row.id, ownerPhone(), { approve: true, until: UNTIL, target: null });
    await requests.changeByOwner(kid.id, {
      scopes: { ...opened.store.personAccess.byProfile(kid.id).scopes, areas: WITHOUT_SETTINGS },
    });
    expect(opened.store.accessRequests.byId(row.id).until).toBe(UNTIL);
    moment = new Date(UNTIL);
    await requests.lapse();
    expect(areasOf(kid.id)).not.toContain('settings');
  });

  it('records no end time for an approval that changed nothing', async () => {
    const kid = person('Kid', { areas: WITHOUT_SETTINGS });
    const row = await requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    opened.store.personAccess.change(kid.id, {
      scopes: {
        ...opened.store.personAccess.byProfile(kid.id).scopes,
        areas: TEMPLATE_SCOPES.adult.areas,
      },
    });
    const decided = await requests.decide(row.id, ownerPhone(), {
      approve: true,
      until: UNTIL,
      target: null,
    });
    expect(decided.until).toBeNull();
  });
});
