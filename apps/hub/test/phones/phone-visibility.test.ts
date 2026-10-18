import type { LiveChange, LiveTable, StateRow } from '@smarteverything/domain';
import { readDeviceLog } from '../../src/devices/device-log/read';
import { deviceDetails } from '../../src/extensions/mcp/tools/devices';
import { eventsOf, historyOf } from '../../src/extensions/mcp/tools/history';
import { phoneViewerOfActor } from '../../src/extensions/mcp/tools/person-reach';
import type { ToolActor } from '../../src/extensions/mcp/tools/registry';
import { placedDevice } from '../../src/extensions/mcp/tools/targets';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { visibleState } from '../../src/computers/computer-access';
import { phoneViewerOfClient } from '../../src/phones/phone-detail';
import {
  otherPhoneTiers,
  valueHiddenByTier,
  visibleEvents,
  visibleRows,
  visiblePhoneValues,
} from '../../src/phones/phone-visibility';
import { projected, visible, type Hearing } from '../../src/server/live-visibility';
import { captureLogs } from '../support/logs';
import { addPerson, addPhoneDevice, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const AT = '2026-10-18T10:00:00.000Z';

let test: TestStore;
let dana: TestPerson;
let sam: TestPerson;
let owner: TestPerson;
let phoneId: string;

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  dana = addPerson(test, 'Dana', 'member');
  sam = addPerson(test, 'Sam', 'member');
  owner = addPerson(test, 'Owner', 'owner');
  phoneId = addPhoneDevice(test, {
    clientId: dana.client.id,
    profileId: dana.profileId,
    name: 'Dana phone',
  }).device.id;
});

afterEach(async () => {
  await test.close();
});

function row(capability: string, deviceId = phoneId): StateRow {
  return { device_id: deviceId, capability, value: 1, observed_at: AT };
}

const ROWS = ['battery', 'now_playing', 'screen_time_today', 'phone_context', 'ringer_mode'];

function visibleTo(person: TestPerson): string[] {
  const devices = test.store.devices.list();
  const tiers = otherPhoneTiers(devices, phoneViewerOfClient(test.store, person.client));
  return visiblePhoneValues(
    tiers,
    ROWS.map((capability) => row(capability)),
  ).map((visibleRow) => visibleRow.capability);
}

describe('phone values by tier', () => {
  it('shows a person every value of their own phone', () => {
    expect(visibleTo(dana)).toEqual(ROWS);
  });

  it('hides from the owner only what belongs to the phone’s own person', () => {
    expect(visibleTo(owner)).toEqual([
      'battery',
      'screen_time_today',
      'phone_context',
      'ringer_mode',
    ]);
  });

  it('hides usage and doing from another member too', () => {
    expect(visibleTo(sam)).toEqual(['battery', 'ringer_mode']);
  });

  it('leaves the values of devices that are not phones alone', () => {
    const [lamp] = test.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'light:1',
        parentId: null,
        kind: 'light',
        name: 'Lamp',
        model: 'm',
        manufacturer: 'v',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    const tiers = otherPhoneTiers(
      test.store.devices.list(),
      phoneViewerOfClient(test.store, sam.client),
    );
    expect(valueHiddenByTier(tiers, row('now_playing', lamp?.id))).toBe(false);
  });
});

describe('where the cut applies', () => {
  it('cuts the state list a caller reads', () => {
    test.store.state.write(
      ['battery', 'screen_time_today', 'now_playing'].map((capability) => ({
        deviceId: phoneId,
        capability,
        value: 1,
        observedAt: AT,
      })),
    );
    const caller = { kind: 'client', client: sam.client } as const;
    expect(visibleState(test.store, caller).map((state) => state.capability)).toEqual(['battery']);
    const ownCaller = { kind: 'client', client: dana.client } as const;
    expect(visibleState(test.store, ownCaller)).toHaveLength(3);
  });

  it('cuts history rows the same way', () => {
    const history = ROWS.map((capability) => row(capability));
    expect(
      visibleRows(test.store, phoneViewerOfClient(test.store, sam.client), history).map(
        (item) => item.capability,
      ),
    ).toEqual(['battery', 'ringer_mode']);
  });

  it('cuts the live changes a connection hears, also for an owner', () => {
    const change = (capability: string): LiveChange => ({
      type: 'change',
      seq: 1,
      table: 'device_state',
      operation: 'UPDATE',
      record: row(capability),
      oldRecord: null,
    });
    const connection = (person: TestPerson): Hearing => ({
      client: person.client,
      tables: new Set<LiveTable>(['device_state']),
    });
    expect(visible(connection(owner), change('now_playing'), test.store)).toBe(false);
    expect(visible(connection(owner), change('battery'), test.store)).toBe(true);
    expect(visible(connection(sam), change('screen_time_today'), test.store)).toBe(false);
    expect(visible(connection(dana), change('now_playing'), test.store)).toBe(true);
  });
});

describe('place names in events and the AI tools', () => {
  const PLACE = 'Gym';
  const STATE_VALUES: Readonly<Record<string, string | number>> = {
    battery: 50,
    phone_context: 'walking',
  };

  function addEvents(): void {
    test.store.events.insert([
      {
        deviceId: phoneId,
        kind: 'place_arrived',
        occurredAt: AT,
        details: { place: PLACE },
      },
      {
        deviceId: phoneId,
        kind: 'phone_context_changed',
        occurredAt: AT,
        details: { from: 'still', to: 'walking', confidence: 80, place: PLACE },
      },
      { deviceId: phoneId, kind: 'phone_unlocked', occurredAt: AT, details: {} },
    ]);
  }

  function kindsFor(person: TestPerson): string[] {
    return visibleEvents(
      test.store,
      phoneViewerOfClient(test.store, person.client),
      test.store.events.list({ limit: 50 }),
    ).map((event) => event.kind);
  }

  it('gives the phone person every event with the place', () => {
    addEvents();
    expect(kindsFor(dana).sort()).toEqual([
      'phone_context_changed',
      'phone_unlocked',
      'place_arrived',
    ]);
  });

  it('drops arriving and leaving for the owner and keeps the context change without its place', () => {
    addEvents();
    expect(kindsFor(owner).sort()).toEqual(['phone_context_changed', 'phone_unlocked']);
    const changed = visibleEvents(
      test.store,
      phoneViewerOfClient(test.store, owner.client),
      test.store.events.list({ kinds: ['phone_context_changed'], limit: 50 }),
    );
    expect(changed[0]?.details['place']).toBeNull();
  });

  it('leaves another member only what holds no place or doing', () => {
    addEvents();
    expect(kindsFor(sam)).toEqual(['phone_unlocked']);
  });

  it('cuts live event changes the same way', () => {
    addEvents();
    const [arrived] = test.store.events.list({ kinds: ['place_arrived'], limit: 50 });
    const [changed] = test.store.events.list({ kinds: ['phone_context_changed'], limit: 50 });
    const connection = (person: TestPerson): Hearing => ({
      client: person.client,
      tables: new Set<LiveTable>(['events']),
    });
    const change = (record: typeof arrived): LiveChange => ({
      type: 'change',
      seq: 1,
      table: 'events',
      operation: 'INSERT',
      record: record ?? null,
      oldRecord: null,
    });
    expect(projected(connection(owner), change(arrived), test.store)).toBeNull();
    expect(projected(connection(sam), change(changed), test.store)).toBeNull();
    expect(projected(connection(dana), change(arrived), test.store)).not.toBeNull();
    const shown = projected(connection(owner), change(changed), test.store);
    expect(shown?.table === 'events' ? shown.record?.details['place'] : 'x').toBeNull();
  });

  it('cuts what the AI of another member reads from the device, its history and its events', () => {
    addEvents();
    test.store.state.write(
      ['battery', 'now_playing', 'phone_context'].map((capability) => ({
        deviceId: phoneId,
        capability,
        value: STATE_VALUES[capability] ?? PLACE,
        observedAt: AT,
      })),
    );
    const actor = (person: TestPerson, role: 'owner' | 'member'): { actor: ToolActor } => ({
      actor: { clientId: person.client.id, profileId: person.profileId, chatId: null, role },
    });
    const placed = placedDevice(test.store, null, phoneId);
    const details = (person: TestPerson, role: 'owner' | 'member'): string =>
      JSON.stringify(
        deviceDetails(test.store, null, phoneViewerOfActor(actor(person, role)), placed),
      );
    expect(details(dana, 'member')).toContain(PLACE);
    expect(details(sam, 'member')).not.toContain(PLACE);
    expect(details(owner, 'owner')).not.toContain(PLACE);
    const range = {
      deviceId: phoneId,
      capability: 'now_playing',
      from: '2026-10-18T00:00:00.000Z',
      to: '2026-10-19T00:00:00.000Z',
      bucket: 'raw' as const,
      limit: 50,
    };
    const playingPoints = (person: TestPerson, role: 'owner' | 'member'): unknown =>
      historyOf(test.store, null, phoneViewerOfActor(actor(person, role)), range)['points'];
    expect(playingPoints(dana, 'member')).toHaveLength(1);
    expect(playingPoints(sam, 'member')).toEqual([]);
    const listed = (person: TestPerson, role: 'owner' | 'member'): string =>
      JSON.stringify(
        eventsOf(test.store, null, phoneViewerOfActor(actor(person, role)), { limit: 50 }),
      );
    expect(listed(dana, 'member')).toContain(PLACE);
    expect(listed(sam, 'member')).not.toContain(PLACE);
    expect(listed(owner, 'owner')).not.toContain(PLACE);
  });

  it('keeps the doing out of the log another member reads for the phone', () => {
    addEvents();
    test.store.state.write([
      { deviceId: phoneId, capability: 'phone_context', value: 'walking', observedAt: AT },
    ]);
    const device = test.store.devices.byId(phoneId);
    const read = (tier: 'owner' | 'member' | null): string[] =>
      readDeviceLog(test.store, { device, to: undefined, limit: 20, tier }).map(
        (entry) => entry.title,
      );
    expect(read(null).length).toBeGreaterThan(read('member').length);
    expect(read('member').join(' ')).not.toContain('walking');
  });
});
