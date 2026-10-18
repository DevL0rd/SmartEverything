import {
  ApiError,
  PHONE_REPORT,
  type DeviceEvent,
  type DiscoveredDevice,
  type PhoneReport,
  type StateUpdate,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceRecord } from '../../src/database/port';
import { PhoneNodes, type PhoneReported } from '../../src/phones/phone-nodes';
import {
  PHONE_CAPABILITIES,
  phoneExternalId,
  type PhoneIdentity,
} from '../../src/phones/phone-device';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { FULL_DETAIL, REPORT_AT, STORED_DETAIL } from '../support/phone-fixtures';
import { addClient } from '../support/socket-client';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';

let test: TestStore;
let logs: CapturedLogs;
let nodes: PhoneNodes;
let phone: PhoneIdentity;
let applied: DiscoveredDevice[][];
let states: StateUpdate[];
let events: DeviceEvent[];
let forgotten: (readonly string[])[];

function report(overrides: Record<string, unknown> = {}): PhoneReport {
  return PHONE_REPORT.parse({
    at: '2026-10-08T10:00:00.000Z',
    values: { battery: 80, charging: false },
    events: [],
    ...overrides,
  });
}

beforeEach(() => {
  logs = captureLogs();
  applied = [];
  states = [];
  events = [];
  forgotten = [];
});

async function startNodes(): Promise<void> {
  test = await testStore();
  const owner = addClient(test, 'Pixel', 'owner');
  phone = { clientId: owner.id, name: 'Pixel', profileId: test.store.profiles.first().id };
  nodes = new PhoneNodes({
    store: test.store,
    apply: (devices): Promise<readonly DeviceRecord[]> => {
      applied.push([...devices]);
      return Promise.resolve(
        test.store.devices
          .upsert(
            devices.map((device) => ({
              provider: device.provider,
              externalId: device.externalId,
              parentId: null,
              kind: device.kind,
              name: device.name,
              model: device.model,
              manufacturer: device.manufacturer,
              providerRoom: device.room,
              roomId: null,
              online: device.online,
              capabilities: device.capabilities,
              details: device.details,
            })),
          )
          .map((row) => ({
            id: row.id,
            provider: row.provider,
            externalId: row.external_id,
            parentId: row.parent_id,
            kind: row.kind,
            online: row.online,
            roomId: row.room_id,
            capabilities: row.capabilities,
            details: row.details,
          })),
      );
    },
    forget: (externalIds): Promise<void> => {
      forgotten.push(externalIds);
      return Promise.resolve();
    },
    state: (update): void => {
      states.push(update);
    },
    event: (event): void => {
      events.push(event);
    },
    log: testLogger('phone'),
  });
  nodes.start();
}

afterEach(async () => {
  nodes.stop();
  await test.close();
});

describe('phone reports', () => {
  beforeEach(startNodes);

  it('saves the phone as a device on its first report and forwards each known value as state', async () => {
    await nodes.report(phone, report({ values: { battery: 80, charging: true, place: 'Home' } }));
    expect(applied).toHaveLength(1);
    expect(applied[0]?.[0]).toMatchObject({
      externalId: phoneExternalId(phone.clientId),
      kind: 'phone',
      details: { clientId: phone.clientId, profileId: phone.profileId },
    });
    expect(states.map((state) => state.capability).sort()).toEqual(['battery', 'charging']);
    expect(states.find((state) => state.capability === 'battery')).toMatchObject({
      externalId: phoneExternalId(phone.clientId),
      value: 80,
      observedAt: '2026-10-08T10:00:00.000Z',
    });
  });

  it('does not save the device again while its name, owner and capabilities are unchanged', async () => {
    await nodes.report(phone, report());
    await nodes.report(phone, report({ at: '2026-10-08T10:05:00.000Z' }));
    expect(applied).toHaveLength(1);
    await nodes.report({ ...phone, name: 'Pixel 9' }, report());
    expect(applied).toHaveLength(2);
    expect(applied[1]?.[0]?.name).toBe('Pixel 9');
  });

  it('saves the device again only when the actions the phone offers change', async () => {
    const lock = { action: 'lock', state: 'ready' };
    await nodes.report(phone, report({ actions: [lock] }));
    await nodes.report(phone, report({ actions: [lock], at: '2026-10-08T10:05:00.000Z' }));
    expect(applied).toHaveLength(1);
    expect(applied[0]?.[0]?.capabilities.map((capability) => capability.key)).toContain(
      'lock_screen',
    );
    await nodes.report(
      phone,
      report({
        actions: [
          {
            action: 'lock',
            state: 'needs_permission',
            permission: 'android_accessibility',
            reason: 'Locking needs the accessibility service.',
          },
        ],
        permissions: [{ permission: 'android_accessibility', granted: false }],
      }),
    );
    expect(applied).toHaveLength(2);
    expect(applied[1]?.[0]?.details).toMatchObject({
      machinePermissions: [{ permission: 'android_accessibility', granted: false }],
    });
  });

  it('forwards events with their time and details', async () => {
    await nodes.report(
      phone,
      report({
        events: [
          {
            kind: 'place_arrived',
            at: '2026-10-08T10:01:00.000Z',
            details: { place: 'Home' },
          },
        ],
      }),
    );
    expect(events).toEqual([
      {
        externalId: phoneExternalId(phone.clientId),
        kind: 'place_arrived',
        occurredAt: '2026-10-08T10:01:00.000Z',
        details: { place: 'Home' },
      },
    ]);
  });

  it('keeps what an earlier report said when a later one omits it', async () => {
    await nodes.report(
      phone,
      report({
        values: {
          phone_context: 'walking',
          context_confidence: 90,
          place: 'Park',
          screen_on: true,
        },
      }),
    );
    await nodes.report(phone, report({ at: '2026-10-08T10:10:00.000Z', values: { battery: 70 } }));
    const entry = test.store.phoneContexts.latestOf(phone.profileId);
    expect(entry).toMatchObject({
      state: 'walking',
      confidence: 90,
      place: 'Park',
      phoneInUse: true,
      since: '2026-10-08T10:00:00.000Z',
      reportedAt: '2026-10-08T10:10:00.000Z',
    });
  });

  it('finds its device by provider and external id without reading the device table', async () => {
    const devices = vi.spyOn(test.store.devices, 'list');
    const byExternal = vi.spyOn(test.store.devices, 'byExternal');
    await nodes.report(phone, report());
    await nodes.report(phone, report({ at: '2026-10-08T10:05:00.000Z' }));
    expect(devices).not.toHaveBeenCalled();
    expect(byExternal).toHaveBeenCalledWith('local', phoneExternalId(phone.clientId));
  });

  it('stores the detail a report carries and tells listeners which phone it was', async () => {
    const heard: unknown[] = [];
    nodes.onReport((reported) => heard.push(reported));
    await nodes.report(phone, report({ at: REPORT_AT, detail: FULL_DETAIL }));
    const device = test.store.devices.byExternal('local', phoneExternalId(phone.clientId));
    expect(test.store.phoneDetails.read(device?.id ?? '').power).toMatchObject({
      level: 62,
      at: REPORT_AT,
    });
    expect(heard[0]).toMatchObject({
      target: { deviceId: device?.id, profileId: phone.profileId },
      at: REPORT_AT,
      detail: STORED_DETAIL,
    });
  });

  it('keeps the valid sections of a report and logs each invalid one by name', async () => {
    const heard: PhoneReported[] = [];
    nodes.onReport((reported) => heard.push(reported));
    await nodes.report(
      phone,
      report({
        at: REPORT_AT,
        values: { battery: 61 },
        detail: { power: { ...FULL_DETAIL.power, level: 500 }, alarm: FULL_DETAIL.alarm },
      }),
    );
    const device = test.store.devices.byExternal('local', phoneExternalId(phone.clientId));
    const stored = test.store.phoneDetails.read(device?.id ?? '');
    expect(Object.keys(stored)).toEqual(['alarm']);
    expect(Object.keys(heard[0]?.detail ?? {})).toEqual(['alarm']);
    expect(states.find((update) => update.capability === 'battery')?.value).toBe(61);
    const invalid = logs.records.find((record) => record.event === 'phone.detail_invalid');
    expect(invalid?.payload).toMatchObject({ section: 'power' });
  });

  it('stores nothing and tells listeners no detail when every section is invalid', async () => {
    const heard: PhoneReported[] = [];
    nodes.onReport((reported) => heard.push(reported));
    await nodes.report(phone, report({ detail: { power: { level: 500 } } }));
    expect(heard[0]?.detail).toBeUndefined();
    expect(logs.events()).toContain('phone.detail_invalid');
  });

  it('tells listeners about a report without detail and leaves the stored detail alone', async () => {
    await nodes.report(phone, report({ detail: FULL_DETAIL }));
    const heard: unknown[] = [];
    nodes.onReport((reported) => heard.push(reported));
    await nodes.report(phone, report({ at: '2026-10-08T10:05:00.000Z' }));
    expect(heard).toHaveLength(1);
    expect(heard[0]).toHaveProperty('detail', undefined);
    const device = test.store.devices.byExternal('local', phoneExternalId(phone.clientId));
    expect(test.store.phoneDetails.read(device?.id ?? '').alarm?.appLabel).toBe('Clock');
  });

  it('stops telling a listener that unsubscribed', async () => {
    const heard: unknown[] = [];
    const stop = nodes.onReport((reported) => heard.push(reported));
    stop();
    await nodes.report(phone, report());
    expect(heard).toEqual([]);
  });

  it('keeps the features a phone reported until it reports others', async () => {
    const torch = { feature: 'torch', state: 'ready' };
    await nodes.report(phone, report({ features: [torch] }));
    await nodes.report(phone, report({ at: '2026-10-08T10:05:00.000Z' }));
    expect(applied).toHaveLength(1);
    expect(applied[0]?.[0]?.details).toMatchObject({ phoneFeatures: [torch] });
    const fold = { feature: 'fold', state: 'unsupported', reason: 'No second screen.' };
    await nodes.report(phone, report({ features: [torch, fold] }));
    expect(applied).toHaveLength(2);
    expect(applied[1]?.[0]?.details).toMatchObject({ phoneFeatures: [torch, fold] });
  });

  it('keeps the actions and permissions a phone reported until it reports others', async () => {
    const lock = { action: 'lock', state: 'ready' };
    const grant = { permission: 'android_accessibility', granted: true };
    await nodes.report(phone, report({ actions: [lock], permissions: [grant] }));
    await nodes.report(phone, report({ at: '2026-10-08T10:05:00.000Z' }));
    expect(applied).toHaveLength(1);
    expect(applied[0]?.[0]?.details).toMatchObject({
      machineActions: [lock],
      machinePermissions: [grant],
    });
    expect(applied[0]?.[0]?.capabilities.map((capability) => capability.key)).toContain(
      'lock_screen',
    );
    await nodes.report(phone, report({ actions: [] }));
    expect(applied).toHaveLength(2);
    expect(applied[1]?.[0]?.capabilities.map((capability) => capability.key)).not.toContain(
      'lock_screen',
    );
  });

  it('saves the device again when only the access of a capability changed', async () => {
    const [device] = test.store.devices.upsert([
      {
        provider: 'local',
        externalId: phoneExternalId(phone.clientId),
        parentId: null,
        kind: 'phone',
        name: phone.name,
        model: 'm',
        manufacturer: 'Android',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: PHONE_CAPABILITIES.map((capability) =>
          capability.key === 'flashlight' ? { ...capability, access: 'write' } : capability,
        ),
        details: {
          clientId: phone.clientId,
          profileId: phone.profileId,
          machineActions: [],
          machinePermissions: [],
          phoneFeatures: [],
        },
      },
    ]);
    expect(device?.capabilities.find((capability) => capability.key === 'flashlight')?.access).toBe(
      'write',
    );
    await nodes.report(phone, report());
    expect(applied).toHaveLength(1);
  });

  it('logs the report once without the values', async () => {
    await nodes.report(phone, report());
    expect(logs.events().filter((event) => event === 'phone.reported')).toHaveLength(1);
  });
});

describe('phone context', () => {
  beforeEach(startNodes);

  it('is unknown for a person whose phone has not reported', () => {
    expect(nodes.contextOf(phone.profileId, phone.profileId)).toEqual({
      profileId: phone.profileId,
      deviceId: null,
      state: 'unknown',
      since: null,
      confidence: null,
      place: null,
      placeShared: false,
      phoneInUse: null,
      reportedAt: null,
    });
  });

  it('shows the place only to its owner', async () => {
    await nodes.report(phone, report({ values: { phone_context: 'still', place: 'Home' } }));
    const own = nodes.contextOf(phone.profileId, phone.profileId);
    expect(own).toMatchObject({ state: 'still', place: 'Home', placeShared: true });
    const other = nodes.contextOf(phone.profileId, crypto.randomUUID());
    expect(other).toMatchObject({ state: 'still', place: null, placeShared: false });
  });
});

describe('phone target', () => {
  beforeEach(startNodes);

  it('names the client and person behind a phone device', async () => {
    await nodes.report(phone, report());
    const device = test.store.devices.list().find((row) => row.kind === 'phone');
    if (device === undefined) {
      throw new Error('the phone device was not stored');
    }
    expect(nodes.target(device)).toEqual({
      deviceId: device.id,
      clientId: phone.clientId,
      profileId: phone.profileId,
      name: 'Pixel',
    });
  });

  it('refuses a device that is not a phone running the app', () => {
    const [lamp] = test.store.devices.upsert([
      {
        provider: 'tuya',
        externalId: 'lamp',
        parentId: null,
        kind: 'light',
        name: 'Lamp',
        model: 'l1',
        manufacturer: 'Tuya',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    expect(() => {
      if (lamp !== undefined) {
        nodes.target(lamp);
      }
    }).toThrow(ApiError);
  });
});

describe('removed clients', () => {
  beforeEach(startNodes);

  it('forgets the phone device when its client is removed', async () => {
    const other = addClient(test, 'Tablet', 'member');
    await nodes.report({ ...phone, clientId: other.id, name: 'Tablet' }, report());
    test.store.clients.remove(other.id);
    await until(() => forgotten.length === 1, 'the device to be forgotten');
    expect(forgotten[0]).toEqual([phoneExternalId(other.id)]);
  });

  it('does nothing for a client that never reported', () => {
    const other = addClient(test, 'Tablet', 'member');
    test.store.clients.remove(other.id);
    expect(forgotten).toEqual([]);
  });

  it('stops listening after stop', async () => {
    const other = addClient(test, 'Tablet', 'member');
    await nodes.report({ ...phone, clientId: other.id, name: 'Tablet' }, report());
    nodes.stop();
    test.store.clients.remove(other.id);
    expect(forgotten).toEqual([]);
  });
});
