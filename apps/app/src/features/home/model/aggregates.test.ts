import { presentValue, withRole } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceModelOf, isOffline, powerStateOf } from '../../devices';
import { orderedRooms } from '../../../store/table-rules';
import {
  deviceValuesOf,
  makeTable,
  rowsOf,
  type Device,
  type StoreState,
} from '../../../store/state';
import { changedSlices, trackReads } from '../../../store/subscriptions';
import { deviceFixture, stateFixture, valuesFixture } from '../../../store/device-fixture';
import { consumersOf, topConsumers, type Consumer } from './consumers';
import { powerOf } from './power';
import { roomSummaries } from './rooms';
import { alertsFirst, securityLines, type SecurityLine } from './security';

const COUNT = 40;

function build(devices: readonly Device[], tick = 0): StoreState {
  return stateFixture(
    devices,
    Object.fromEntries(devices.map((device, index) => [device.id, valuesFixture(index, tick)])),
  );
}

function fleet(): readonly Device[] {
  return Array.from({ length: COUNT }, (_, index) => deviceFixture(index));
}

function withValues(state: StoreState, index: number, tick: number): StoreState {
  return {
    ...state,
    deviceValues: state.deviceValues.set(`dev-${String(index)}`, valuesFixture(index, tick)),
  };
}

function withDevices(state: StoreState, devices: readonly Device[]): StoreState {
  return {
    ...state,
    tables: {
      ...state.tables,
      devices: makeTable(
        Object.fromEntries(devices.map((device) => [device.id, device])),
        devices.map((device) => device.id),
        state.tables.devices.version + 1,
      ),
    },
  };
}

function replaced(devices: readonly Device[], index: number, device: Device): readonly Device[] {
  return devices.map((existing, at) => (at === index ? device : existing));
}

function visible(state: StoreState): readonly Device[] {
  return rowsOf(state.tables.devices).filter((device) => !device.hidden);
}

function referencePower(state: StoreState): { watts: number; ids: readonly string[] } | null {
  const draws = visible(state).flatMap((device) => {
    const presented = withRole(deviceModelOf(device).presentation, 'power_draw');
    const value =
      presented === undefined
        ? undefined
        : state.deviceValues.get(device.id)?.[presented.key]?.value;
    return presented !== undefined &&
      device.online &&
      typeof value === 'number' &&
      Number.isFinite(value)
      ? [{ id: device.id, value }]
      : [];
  });
  return draws.length === 0
    ? null
    : { watts: draws.reduce((sum, draw) => sum + draw.value, 0), ids: draws.map((d) => d.id) };
}

function referenceConsumers(state: StoreState): readonly Consumer[] {
  return topConsumers(
    visible(state).flatMap((device) => {
      const presented = withRole(deviceModelOf(device).presentation, 'power_draw');
      const value =
        presented === undefined
          ? undefined
          : state.deviceValues.get(device.id)?.[presented.key]?.value;
      return presented !== undefined && device.online && typeof value === 'number'
        ? [{ deviceId: device.id, name: device.label, value, unit: presented.unit }]
        : [];
    }),
  );
}

function referenceSecurity(state: StoreState): readonly SecurityLine[] {
  const roles = ['lock', 'leak', 'smoke', 'gas', 'contact'] as const;
  return alertsFirst(
    visible(state).flatMap((device) => {
      const { presentation } = deviceModelOf(device);
      const role = roles.find((candidate) => withRole(presentation, candidate) !== undefined);
      const presented = role === undefined ? undefined : withRole(presentation, role);
      const value =
        presented === undefined
          ? undefined
          : state.deviceValues.get(device.id)?.[presented.key]?.value;
      if (role === undefined || presented === undefined || typeof value !== 'boolean') return [];
      const shown =
        role === 'lock' ? (value ? 'Locked' : 'Unlocked') : presentValue(presented, value);
      return [
        {
          deviceId: device.id,
          name: device.label,
          state: device.online ? shown : 'Offline',
          alert: device.online && role === 'lock' && !value,
        },
      ];
    }),
  );
}

function referenceRooms(state: StoreState): readonly unknown[] {
  const models = visible(state).map(deviceModelOf);
  return orderedRooms(rowsOf(state.tables.rooms)).flatMap((room) => {
    const members = models.filter((model) => model.device.room_id === room.id);
    if (members.length === 0) return [];
    const powers = members.map((model) =>
      powerStateOf(model, deviceValuesOf(state, model.device.id)),
    );
    const lights = members.flatMap((model, index) =>
      model.family === 'light' ? [powers[index]] : [],
    );
    return [
      {
        id: room.id,
        name: room.name,
        devices: members.length,
        on: powers.filter((power) => power === 'on').length,
        offline: members.filter((model) => isOffline(model.device)).length,
        lights: lights.length,
        lightsOn: lights.filter((power) => power === 'on').length,
        members: members.slice(0, 3).map((model, index) => ({
          id: model.device.id,
          family: model.family,
          on: powers[index] === 'on',
        })),
      },
    ];
  });
}

function expectMatchesReference(state: StoreState): void {
  const power = powerOf(state);
  const expected = referencePower(state);
  expect(power === null ? null : power.watts).toBe(expected === null ? null : expected.watts);
  expect(power?.sources.map((device) => device.id) ?? null).toEqual(expected?.ids ?? null);
  expect(consumersOf(state)).toEqual(referenceConsumers(state));
  expect(securityLines(state)).toEqual(referenceSecurity(state));
  expect(roomSummaries(state)).toEqual(referenceRooms(state));
}

describe('home aggregates against the full recompute', () => {
  it('follow value changes, going offline, renames, room moves, hiding, adding and removing', () => {
    let devices = fleet();
    let state = build(devices);
    expectMatchesReference(state);
    for (let tick = 1; tick <= 30; tick += 1) {
      state = withValues(state, (tick * 7) % COUNT, tick);
      expectMatchesReference(state);
    }
    devices = replaced(devices, 5, deviceFixture(5, { online: false }));
    state = withDevices(state, devices);
    expectMatchesReference(state);
    state = withValues(state, 10, 99);
    expectMatchesReference(state);
    devices = replaced(devices, 10, deviceFixture(10, { display_name: 'Renamed plug' }));
    state = withDevices(state, devices);
    expectMatchesReference(state);
    devices = replaced(devices, 15, deviceFixture(15, { room_id: 'room-3' }));
    state = withDevices(state, devices);
    expectMatchesReference(state);
    devices = replaced(devices, 20, deviceFixture(20, { hidden: true }));
    state = withDevices(state, devices);
    expectMatchesReference(state);
    devices = [...devices, deviceFixture(COUNT)];
    state = withValues(withDevices(state, devices), COUNT, 3);
    expectMatchesReference(state);
    devices = devices.filter((device) => device.id !== 'dev-0');
    state = withDevices(state, devices);
    expectMatchesReference(state);
  });

  it('keep the same result objects when nothing they show changed', () => {
    const state = build(fleet());
    const power = powerOf(state);
    const rooms = roomSummaries(state);
    const lines = securityLines(state);
    const consumers = consumersOf(state);
    const unrelated = withValues(state, 3, 40);
    expect(powerOf(unrelated)).toBe(power);
    expect(roomSummaries(unrelated)).toBe(rooms);
    expect(securityLines(unrelated)).toBe(lines);
    expect(consumersOf(unrelated)).toBe(consumers);
  });

  it('are woken only by the devices they read', () => {
    const state = build(fleet());
    const reads = trackReads(state, powerOf).reads;
    const light = withValues(state, 1, 5);
    const plug = withValues(state, 5, 5);
    const touches = (next: StoreState): boolean =>
      [...changedSlices(state, next)].some((slice) => reads.has(slice));
    expect(touches(light)).toBe(false);
    expect(touches(plug)).toBe(true);
  });
});
