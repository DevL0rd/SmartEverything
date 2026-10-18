import { describe, expect, it } from 'vitest';
import type { DeviceRow, RoomRow, TargetV2 } from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import { catalogFixture } from '../model/catalog-fixture';
import {
  availableKinds,
  kindOf,
  roomLightEntries,
  roomLightsChoice,
  targetFor,
} from './target-kind';

const HALL = '50000000-0000-4000-8000-000000000001';
const STUDY = '50000000-0000-4000-8000-000000000002';

const rooms: readonly RoomRow[] = [
  { id: HALL, name: 'Hall', position: 0 },
  { id: STUDY, name: 'Study', position: 1 },
];

function light(index: number, room: string): ReturnType<typeof deviceFixture> {
  return deviceFixture(index * 5 + 1, {
    kind: 'light',
    room_id: room,
  } satisfies Partial<DeviceRow>);
}

const hallLights = [light(1, HALL), light(2, HALL)];
const lonelyStudy = light(3, STUDY);

function catalogWith(devices: ReturnType<typeof light>[]): ReturnType<typeof catalogFixture> {
  return catalogFixture({ devices, allDevices: devices, rooms });
}

describe('the automation target kinds', () => {
  it('reads a room target that holds only lights as the room lights kind', () => {
    expect(kindOf({ room: HALL, families: ['light'] })).toBe('room-lights');
    expect(kindOf({ room: HALL })).toBe('room');
    expect(kindOf({ room: HALL, families: ['light', 'plug'] })).toBe('room');
    expect(kindOf({ room: HALL, families: ['plug'] })).toBe('room');
  });

  it('offers room lights only for rooms with two or more visible lights', () => {
    const catalog = catalogWith([...hallLights, lonelyStudy]);
    expect(roomLightEntries(catalog).map((entry) => entry.name)).toStrictEqual(['Hall lights']);
    expect(roomLightsChoice(catalog, HALL)).toBe(HALL);
    expect(roomLightsChoice(catalog, STUDY)).toBeNull();
  });

  it('lists the room lights kind between devices and rooms, and hides it when no room qualifies', () => {
    const withLights = catalogWith(hallLights);
    expect(availableKinds(withLights, 'device')).toStrictEqual([
      'device',
      'devices',
      'room-lights',
      'room',
    ]);
    const single = catalogWith([lonelyStudy]);
    expect(availableKinds(single, 'device')).not.toContain('room-lights');
    expect(availableKinds(single, 'room-lights')).toContain('room-lights');
  });

  it('starts a room lights target on the first room that qualifies', () => {
    const made = targetFor('room-lights', catalogWith(hallLights), { device: 'x' });
    expect(made).toStrictEqual<TargetV2>({ room: HALL, families: ['light'] });
    expect(targetFor('room-lights', catalogWith([lonelyStudy]), { device: 'x' })).toBeNull();
  });

  it('keeps a plain room target free of a family filter', () => {
    expect(targetFor('room', catalogWith(hallLights), { device: 'x' })).toStrictEqual({
      room: HALL,
    });
  });
});
