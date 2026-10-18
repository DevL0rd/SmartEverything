import type { DeviceCapability, RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceUpsert } from '../../src/database/port';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let clock = Date.parse('2026-10-08T10:00:00.000Z');

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

function discovered(overrides: Partial<DeviceUpsert> = {}): DeviceUpsert {
  return {
    provider: 'tuya',
    externalId: 'plug-1',
    parentId: null,
    kind: 'plug',
    name: 'Plug',
    model: 'p1',
    manufacturer: 'Tuya',
    providerRoom: 'Kitchen',
    roomId: null,
    online: true,
    capabilities: [POWER],
    details: { firmware: '1.0' },
    ...overrides,
  };
}

beforeEach(async () => {
  captureLogs();
  clock = Date.parse('2026-10-08T10:00:00.000Z');
  opened = await testStore(() => new Date(clock));
});

afterEach(async () => {
  await opened.close();
});

describe('devices', () => {
  it('lets the hub change what a device is but keeps what people chose', () => {
    const { store } = opened;
    const kitchen = store.rooms.create('Kitchen', 0);
    const hall = store.rooms.create('Hall', 1);
    const [plug] = store.devices.upsert([discovered({ roomId: kitchen.id })]);
    store.devices.update(plug?.id ?? '', {
      display_name: 'Kettle',
      hidden: true,
      favourite: true,
      position: 4,
      room_id: hall.id,
    });
    const [again] = store.devices.upsert([
      discovered({
        name: 'Plug v2',
        roomId: kitchen.id,
        online: false,
        details: { firmware: '2.0' },
      }),
    ]);
    expect(again).toMatchObject({
      id: plug?.id,
      name: 'Plug v2',
      display_name: 'Kettle',
      hidden: true,
      favourite: true,
      position: 4,
      room_id: hall.id,
      online: false,
      details: { firmware: '2.0' },
      capabilities: [POWER],
    });
  });

  it('places a device the hub reports in a room only while it has none', () => {
    const { store } = opened;
    const kitchen = store.rooms.create('Kitchen', 0);
    const [plug] = store.devices.upsert([discovered()]);
    expect(plug?.room_id).toBeNull();
    expect(store.devices.upsert([discovered({ roomId: kitchen.id })])[0]?.room_id).toBe(kitchen.id);
  });

  it('unplaces the devices of a removed room and says so on the feed', () => {
    const { store } = opened;
    const kitchen = store.rooms.create('Kitchen', 0);
    const [plug] = store.devices.upsert([discovered({ roomId: kitchen.id })]);
    const seen: RowChange[] = [];
    store.feed.subscribe((change) => seen.push(change));
    store.rooms.remove(kitchen.id, (roomId) => {
      store.devices.unplace(roomId);
    });
    expect(store.devices.byId(plug?.id ?? '').room_id).toBeNull();
    expect(seen.map((change) => `${change.table}:${change.operation}`)).toStrictEqual([
      'devices:UPDATE',
      'rooms:DELETE',
    ]);
  });

  it('matches names to existing rooms only and never creates one', () => {
    const { store } = opened;
    const hall = store.rooms.create('Hall', 3);
    const rooms = store.rooms.matchNames(['hall ', 'Study']);
    expect(rooms.get('hall ')).toBe(hall.id);
    expect(rooms.has('Study')).toBe(false);
    expect(store.rooms.list().map((room) => room.name)).toStrictEqual(['Hall']);
  });

  it('reads one current value by device and capability, including null', () => {
    const { store } = opened;
    const [plug] = store.devices.upsert([discovered()]);
    const id = plug?.id ?? '';
    expect(store.state.value(id, 'power')).toBeUndefined();
    store.state.write([
      {
        deviceId: id,
        capability: 'power',
        value: { on: true },
        observedAt: '2026-10-08T08:00:00Z',
      },
      { deviceId: id, capability: 'mode', value: null, observedAt: '2026-10-08T08:00:00Z' },
    ]);
    expect(store.state.value(id, 'power')).toStrictEqual({ on: true });
    expect(store.state.value(id, 'mode')).toBeNull();
    expect(store.state.value(id, 'other')).toBeUndefined();
  });

  it('records history only when a value changes and keeps the latest value', () => {
    const { store } = opened;
    const [plug] = store.devices.upsert([discovered()]);
    const id = plug?.id ?? '';
    store.state.write([
      {
        deviceId: id,
        capability: 'power',
        value: { on: true, level: 1 },
        observedAt: '2026-10-08T10:00:00+02:00',
      },
    ]);
    store.state.write([
      {
        deviceId: id,
        capability: 'power',
        value: { level: 1, on: true },
        observedAt: '2026-10-08T08:01:00Z',
      },
    ]);
    store.state.write([
      { deviceId: id, capability: 'power', value: false, observedAt: '2026-10-08T08:02:00Z' },
    ]);
    expect(store.state.list()).toStrictEqual([
      { device_id: id, capability: 'power', value: false, observed_at: '2026-10-08T08:02:00.000Z' },
    ]);
    const history = store.state.history({
      capabilities: ['power'],
      from: '2026-10-08T00:00:00Z',
      order: 'desc',
      limit: 10,
    });
    expect(history.map((row) => [row.observed_at, row.value])).toStrictEqual([
      ['2026-10-08T08:02:00.000Z', false],
      ['2026-10-08T08:00:00.000Z', { on: true, level: 1 }],
    ]);
    expect(
      store.state.history({
        capabilities: ['power'],
        from: '2026-10-08T00:00:00Z',
        to: '2026-10-08T08:01:00Z',
        deviceIds: [id],
        order: 'asc',
        limit: 1,
      }),
    ).toHaveLength(1);
    expect(
      store.state.history({
        capabilities: ['temperature'],
        from: '2026-10-08T00:00:00Z',
        order: 'asc',
        limit: 10,
      }),
    ).toStrictEqual([]);
  });

  it('aggregates numeric history into buckets and keeps the last value of each', () => {
    const { store } = opened;
    const [plug] = store.devices.upsert([discovered()]);
    const id = plug?.id ?? '';
    const writes: [string, number | string][] = [
      ['2026-10-08T10:05:00Z', 20],
      ['2026-10-08T10:50:00Z', 24],
      ['2026-10-08T11:10:00Z', 30],
      ['2026-10-08T11:20:00Z', 'error'],
    ];
    for (const [observedAt, value] of writes) {
      store.state.write([{ deviceId: id, capability: 'temperature', value, observedAt }]);
    }
    expect(
      store.state.buckets({
        capabilities: ['temperature'],
        from: '2026-10-08T10:00:00Z',
        to: '2026-10-08T12:00:00Z',
        bucketSeconds: 3600,
      }),
    ).toStrictEqual([
      {
        device_id: id,
        capability: 'temperature',
        bucket_start: '2026-10-08T10:00:00.000Z',
        count: 2,
        average: 22,
        minimum: 20,
        maximum: 24,
        last: 24,
      },
      {
        device_id: id,
        capability: 'temperature',
        bucket_start: '2026-10-08T11:00:00.000Z',
        count: 2,
        average: 30,
        minimum: 30,
        maximum: 30,
        last: 'error',
      },
    ]);
  });

  it('marks devices online or offline and skips ids it does not know', () => {
    const { store } = opened;
    const [plug] = store.devices.upsert([discovered()]);
    clock += 1000;
    const changed = store.devices.setOnline(
      [plug?.id ?? '', '0d000000-0000-4000-8000-000000000009'],
      false,
    );
    expect(changed.map((device) => [device.online, device.updated_at])).toStrictEqual([
      [false, '2026-10-08T10:00:01.000Z'],
    ]);
    expect(() => store.devices.byId('0d000000-0000-4000-8000-000000000009')).toThrow(
      'There is no device 0d000000-0000-4000-8000-000000000009.',
    );
  });
});
