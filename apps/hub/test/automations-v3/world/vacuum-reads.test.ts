import type { DeviceCapability, DeviceRow, JsonValue } from '@smarteverything/domain';
import { VACUUM_FAULT_KEY, vacuumFaultText } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coreNodeReadHandlers } from '../../../src/automations/world-v3/core-node-reads';
import { ReadFailure } from '../../../src/automations/world-v3/read-port';
import {
  VACUUM_CLEANING_CAPABILITY,
  VACUUM_FAULT_CAPABILITY,
} from '../../../src/vacuum/capabilities';
import { furnish, type Home } from './support';

const JOB = 'raw:2.40';

const CONSUMABLE_KEYS = {
  main_brush: 'raw:12.1',
  side_brush: 'raw:13.1',
  filter: 'filter_life',
  mop: 'raw:9.1',
  roller: 'raw:24.1',
  detergent: 'raw:18.1',
  dust_bag: 'raw:19.1',
} as const;

function reading(key: DeviceCapability['key'], label: string): DeviceCapability {
  return { key, label, access: 'read', value: { kind: 'number', min: 0, max: 100, step: 1 } };
}

const CAPABILITIES: readonly DeviceCapability[] = [
  VACUUM_CLEANING_CAPABILITY,
  VACUUM_FAULT_CAPABILITY,
  reading('battery', 'Battery'),
  {
    key: JOB,
    label: 'Current cleaning config',
    access: 'read',
    value: { kind: 'text', maxLength: 512 },
  },
  ...Object.values(CONSUMABLE_KEYS).map((key) => reading(key, key)),
];

let home: Home;
let robot: DeviceRow;

function roomOf(name: string): string {
  const found = home.test.store.rooms.list().find((room) => room.name === name);
  if (found === undefined) throw new Error(`${name} is not a room`);
  return found.id;
}

function linkMapRoom(mapRoomId: number, name: string, homeRoom: string): void {
  home.test.store.vacuumRoomLinks.link(robot.id, {
    mapRoomId,
    mapRoomName: name,
    roomId: roomOf(homeRoom),
  });
}

function job(rooms: readonly number[]): string {
  return JSON.stringify({ rooms, zones: [] });
}

beforeEach(async () => {
  home = await furnish();
  const [stored] = home.test.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'robot-1',
      parentId: null,
      kind: 'vacuum',
      name: 'Robot',
      model: 'xiaomi.vacuum.pv11gl',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [...CAPABILITIES],
      details: {},
    },
  ]);
  if (stored === undefined) throw new Error('the robot was not stored');
  robot = stored;
});

afterEach(async () => {
  await home.test.close();
});

function read(device: DeviceRow = robot): Readonly<Record<string, JsonValue>> {
  return home.read('vacuum.read', { vacuum: { device: device.id } }).outputs;
}

function write(key: string, value: JsonValue): void {
  home.write(robot, key, value);
}

describe('vacuum.read', () => {
  it('registers as a read handler of the core node reads', () => {
    expect(Object.keys(coreNodeReadHandlers(home.deps))).toContain('vacuum.read');
  });

  it('leaves out everything the robot has not reported', () => {
    expect(read()).toEqual({});
  });

  it('reports what it is doing, the battery and that it is not docked while cleaning', () => {
    write('cleaning', 'cleaning');
    write('battery', 64);
    expect(read()).toMatchObject({ state: 'cleaning', battery: 64, docked: false });
  });

  it('reports docked while charging or fully charged on the dock', () => {
    write('cleaning', 'charging');
    expect(read()).toMatchObject({ state: 'charging', docked: true });
    write('cleaning', 'docked');
    expect(read()).toMatchObject({ state: 'docked', docked: true });
    write('cleaning', 'returning');
    expect(read()).toMatchObject({ state: 'returning', docked: false });
  });

  it('maps the map rooms of the job to home rooms and drops rooms that are not linked', () => {
    linkMapRoom(16, 'Kitchen', 'Kitchen');
    linkMapRoom(17, 'Study room', 'Study');
    write('cleaning', 'cleaning');
    write(JOB, job([16, 17, 18]));
    expect(read()['cleaningRooms']).toEqual([
      { room: roomOf('Kitchen') },
      { room: roomOf('Study') },
    ]);
  });

  it('lists a home room once when two map rooms are linked to it', () => {
    linkMapRoom(16, 'Kitchen', 'Kitchen');
    linkMapRoom(19, 'Kitchen corner', 'Kitchen');
    write('cleaning', 'cleaning');
    write(JOB, job([16, 19]));
    expect(read()['cleaningRooms']).toEqual([{ room: roomOf('Kitchen') }]);
  });

  it('ignores a link to a room that left the map', () => {
    linkMapRoom(16, 'Kitchen', 'Kitchen');
    linkMapRoom(17, 'Study room', 'Study');
    home.test.store.vacuumRoomLinks.reconcile(
      robot.id,
      [{ id: 16, name: 'Kitchen' }],
      '2026-10-25T00:00:00.000Z',
    );
    write('cleaning', 'cleaning');
    write(JOB, job([16, 17]));
    expect(read()['cleaningRooms']).toEqual([{ room: roomOf('Kitchen') }]);
  });

  it('has no cleaning rooms while the robot is not on a job, whatever the last job was', () => {
    linkMapRoom(16, 'Kitchen', 'Kitchen');
    write(JOB, job([16]));
    write('cleaning', 'docked');
    expect(read()['cleaningRooms']).toEqual([]);
    write('cleaning', 'cleaning');
    expect(read()['cleaningRooms']).toEqual([{ room: roomOf('Kitchen') }]);
  });

  it('leaves the cleaning rooms out when the robot is on a job it does not describe', () => {
    write('cleaning', 'cleaning');
    expect(read()).not.toHaveProperty('cleaningRooms');
  });

  it('reports a whole-home job as no rooms', () => {
    write('cleaning', 'cleaning');
    write(JOB, job([]));
    expect(read()['cleaningRooms']).toEqual([]);
  });

  it('fails with the reason when the job is not the JSON the robot is known to send', () => {
    write('cleaning', 'cleaning');
    write(JOB, 'not json');
    expect(() => read()).toThrow(ReadFailure);
    expect(() => read()).toThrow('vacuum_job');
  });

  it('reports the title of the fault as text and empty text when there is none', () => {
    write(
      VACUUM_FAULT_KEY,
      vacuumFaultText({ code: 21, title: 'The robot is stuck', hint: 'Free it', canHelp: false }),
    );
    expect(read()['fault']).toBe('The robot is stuck');
    write(VACUUM_FAULT_KEY, vacuumFaultText(null));
    expect(read()['fault']).toBe('');
  });

  it('reports the life left of every part the robot reports as a percentage by part', () => {
    write(CONSUMABLE_KEYS.main_brush, 80);
    write(CONSUMABLE_KEYS.filter, 45);
    write(CONSUMABLE_KEYS.dust_bag, 7);
    expect(read()['consumables']).toEqual({ main_brush: 80, filter: 45, dust_bag: 7 });
    for (const [name, key] of Object.entries(CONSUMABLE_KEYS)) write(key, name.length);
    expect(read()['consumables']).toEqual(
      Object.fromEntries(Object.keys(CONSUMABLE_KEYS).map((name) => [name, name.length])),
    );
  });

  it('fails with the reason when a part reports something that is not a number', () => {
    write(CONSUMABLE_KEYS.mop, 'worn');
    expect(() => read()).toThrow(ReadFailure);
  });

  it('fails with the reason when the robot reports a state it does not define', () => {
    write('cleaning', 'start');
    expect(() => read()).toThrow(ReadFailure);
  });

  it('is Invalid for a device that is no robot vacuum and NotFound for a missing one', () => {
    expect(() => read(home.lampA)).toThrow('not a robot vacuum');
    expect(() =>
      home.read('vacuum.read', { vacuum: { device: '00000000-0000-4000-8000-000000000000' } }),
    ).toThrow(ReadFailure);
  });

  it('rejects inputs it cannot read', () => {
    expect(() => home.read('vacuum.read', {})).toThrow('cannot read');
  });
});
