import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonValue } from '@smarteverything/domain';
import { ReadFailure, type ReadInputs } from '../../../src/automations/world-v3/read-port';
import { furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
  const before = '2026-10-18T10:00:00.000Z';
  home.write(home.lampA, 'power', true, before);
  home.write(home.lampB, 'power', false, before);
  home.write(home.lampA, 'brightness', 80, before);
  home.write(home.lampB, 'brightness', 20, before);
});

afterEach(async () => {
  await home.test.close();
});

const ref = (id: string): { device: string } => ({ device: id });
const room = (id: string): { room: string } => ({ room: id });

function aggregate(fn: string, matches?: JsonValue, control = 'power'): ReturnType<Home['read']> {
  return home.read('device.aggregate', {
    target: room(home.kitchen.id),
    control,
    fn,
    ...(matches === undefined ? {} : { matches }),
  });
}

describe('device.aggregate', () => {
  it('answers any, all, none and count against a matching value', () => {
    expect(aggregate('any', true).outputs).toMatchObject({ value: true, count: 1 });
    expect(aggregate('all', true).outputs).toMatchObject({ value: false, count: 1 });
    expect(aggregate('none', true).outputs).toMatchObject({ value: false });
    expect(aggregate('count', true).outputs).toMatchObject({ value: 1, count: 1 });
    expect(aggregate('none', 'purple').outputs).toMatchObject({ value: true, count: 0 });
  });

  it('lists the devices that matched', () => {
    expect(aggregate('any', true).outputs['matching']).toEqual([ref(home.lampA.id)]);
    expect(aggregate('any', false).outputs['matching']).toEqual([ref(home.lampB.id)]);
  });

  it('counts a device with no reading against all and never as a match', () => {
    const unread = home.read('device.aggregate', {
      target: { devices: [home.lampA.id, home.motion.id] },
      control: 'occupancy',
      fn: 'all',
      matches: true,
    });
    expect(unread.outputs).toMatchObject({ value: false, count: 0 });
  });

  it('is true for all only when a reading exists and every one matches', () => {
    home.write(home.lampB, 'power', true);
    expect(aggregate('all', true).outputs['value']).toBe(true);
    const nothing = home.read('device.aggregate', {
      target: { room: home.study.id },
      control: 'brightness',
      fn: 'all',
      matches: 10,
    });
    expect(nothing.outputs).toMatchObject({ value: false, count: 0 });
  });

  it('combines numbers with average, min, max and sum', () => {
    expect(aggregate('average', undefined, 'brightness').outputs).toMatchObject({
      value: 50,
      count: 2,
    });
    expect(aggregate('min', undefined, 'brightness').outputs['value']).toBe(20);
    expect(aggregate('max', undefined, 'brightness').outputs['value']).toBe(80);
    expect(aggregate('sum', undefined, 'brightness').outputs['value']).toBe(100);
  });

  it('gives null for an average, minimum or maximum with nothing to combine and zero for a sum', () => {
    const empty = (fn: string): ReturnType<Home['read']> =>
      home.read('device.aggregate', {
        target: { room: home.study.id },
        control: 'brightness',
        fn,
      });
    expect(empty('average').outputs).toMatchObject({ value: null, count: 0 });
    expect(empty('min').outputs['value']).toBeNull();
    expect(empty('max').outputs['value']).toBeNull();
    expect(empty('sum').outputs['value']).toBe(0);
  });

  it('fails with TypeError when a numeric function meets a value that is not a number', () => {
    expect(() => aggregate('average')).toThrow(
      expect.objectContaining({ errorClass: 'TypeError' }),
    );
  });

  it('gives the value of the device that changed last', () => {
    home.write(home.lampB, 'brightness', 25, '2026-10-18T11:50:00.000Z');
    home.write(home.lampA, 'brightness', 85, '2026-10-18T11:55:00.000Z');
    expect(aggregate('latest', undefined, 'brightness').outputs).toMatchObject({
      value: 85,
      count: 1,
      matching: [ref(home.lampA.id)],
    });
  });

  it('skips devices that have no reading when it combines numbers or looks for the latest change', () => {
    const unread = (fn: string): ReturnType<Home['read']> =>
      home.read('device.aggregate', {
        target: { devices: [home.sensor.id] },
        control: 'humidity',
        fn,
      });
    expect(unread('average').outputs).toMatchObject({ value: null, count: 0 });
    expect(unread('latest').outputs).toMatchObject({ value: null, count: 0 });
  });

  it('narrows a room target to the families it names', () => {
    const lights = home.read('device.aggregate', {
      target: { room: home.kitchen.id, families: ['light'] },
      control: 'power',
      fn: 'count',
      matches: true,
    });
    expect(lights.outputs).toMatchObject({ value: 1, count: 1 });
  });

  it('gives null for latest when nothing has changed', () => {
    const none = home.read('device.aggregate', {
      target: { room: home.study.id },
      control: 'brightness',
      fn: 'latest',
    });
    expect(none.outputs).toMatchObject({ value: null, count: 0, matching: [] });
  });

  it('refuses a match function without the value to match', () => {
    expect(() => aggregate('any')).toThrow(/needs the value/);
  });

  it('fails with NotFound for a room or group that does not exist', () => {
    const read = (): unknown =>
      home.read('device.aggregate', {
        target: { room: 'gone' },
        control: 'power',
        fn: 'count',
        matches: true,
      });
    expect(read).toThrow(ReadFailure);
    expect(read).toThrow(/gone/);
  });

  it('accepts a single device, a list of devices and a group as the target', () => {
    const group = home.test.store.deviceGroups.create({
      name: 'Lamps',
      device_ids: [home.lampA.id, home.lampB.id],
    });
    for (const target of [
      { device: home.lampA.id },
      { devices: [home.lampA.id, home.lampB.id] },
      { group: group.id },
    ]) {
      const result = home.read('device.aggregate', {
        target,
        control: 'power',
        fn: 'any',
        matches: true,
      });
      expect(result.outputs['value']).toBe(true);
    }
  });
});

describe('device.query', () => {
  const query = (inputs: ReadInputs): ReturnType<Home['read']> => home.read('device.query', inputs);

  it('lists every visible device when nothing narrows it', () => {
    expect(query({}).outputs['count']).toBe(5);
  });

  it('narrows by room, group, family and availability', () => {
    expect(query({ room: room(home.kitchen.id) }).outputs['count']).toBe(4);
    expect(query({ families: ['light'] }).outputs['count']).toBe(3);
    expect(query({ families: ['light'], availableOnly: true }).outputs['count']).toBe(2);
    const group = home.test.store.deviceGroups.create({
      name: 'Pair',
      device_ids: [home.lampA.id, home.lampC.id],
    });
    const both = query({ room: room(home.kitchen.id), group: { group: group.id } });
    expect(both.outputs['devices']).toEqual([ref(home.lampA.id)]);
  });

  it('narrows by a role a device has', () => {
    const result = query({ roles: ['temperature'] });
    expect(result.outputs['devices']).toEqual([ref(home.sensor.id)]);
  });

  it('leaves out hidden devices', () => {
    home.test.store.devices.update(home.lampB.id, { hidden: true });
    expect(query({ room: room(home.kitchen.id) }).outputs['count']).toBe(3);
  });

  it('applies the per-device test the run gives', () => {
    const result = home.read('device.query', {}, { deviceTest: (id) => id === home.lampA.id });
    expect(result.outputs['devices']).toEqual([ref(home.lampA.id)]);
  });

  it('says plainly that devices carry no labels', () => {
    expect(() => query({ labels: ['hall'] })).toThrow(/no labels/);
  });

  it('rejects a family the home does not have', () => {
    expect(() => query({ families: ['toaster'] })).toThrow(ReadFailure);
  });
});

describe('room.info and group.members', () => {
  it('describes a room from its devices', () => {
    home.write(home.sensor, 'temperature', 22);
    home.write(home.sensor, 'humidity', 48);
    home.write(home.motion, 'occupancy', true);
    expect(home.read('room.info', { room: room(home.kitchen.id) }).outputs).toMatchObject({
      occupied: true,
      temperature: 22,
      humidity: 48,
      lightsOn: 1,
    });
  });

  it('leaves out what the room has no sensor for and counts no lights', () => {
    const { outputs } = home.read('room.info', { room: room(home.study.id) });
    expect(outputs).toEqual({ devices: [ref(home.lampC.id)], lightsOn: 0 });
  });

  it('says a room is not occupied when its sensors read false', () => {
    home.write(home.motion, 'occupancy', false);
    expect(home.read('room.info', { room: room(home.kitchen.id) }).outputs['occupied']).toBe(false);
  });

  it('lists the members of a group', () => {
    const group = home.test.store.deviceGroups.create({
      name: 'Pair',
      device_ids: [home.lampA.id, home.lampB.id],
    });
    expect(home.read('group.members', { group: { group: group.id } }).outputs['devices']).toEqual([
      ref(home.lampA.id),
      ref(home.lampB.id),
    ]);
  });

  it('fails with NotFound for a room or group that is gone', () => {
    expect(() => home.read('room.info', { room: room('gone') })).toThrow(/gone/);
    expect(() => home.read('group.members', { group: { group: 'gone' } })).toThrow(/gone/);
  });
});
