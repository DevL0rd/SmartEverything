import { describe, expect, it } from 'vitest';
import {
  DEVICE_ROW,
  ROOM_LIGHTS_MINIMUM,
  groupTargets,
  roomLightTargets,
  roomLightsName,
  roomLightsTarget,
  targetEntry,
  targetKey,
  targetDevices,
  visibleLights,
  type DeviceGroupRow,
  type DeviceRow,
  type RoomRow,
} from '../src';

const STUDY = '7c000000-0000-4000-8000-000000000001';
const HALL = '7c000000-0000-4000-8000-000000000002';
const LOUNGE = '7c000000-0000-4000-8000-000000000003';
const GROUP = '7c000000-0000-4000-8000-000000000004';
const GONE = '7c000000-0000-4000-8000-000000000005';
const MOMENT = '2026-10-08T10:00:00.000Z';

let counter = 0;

function device(overrides: Record<string, unknown>): DeviceRow {
  counter += 1;
  return DEVICE_ROW.parse({
    id: `7d000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`,
    provider: 'xiaomi',
    external_id: `catalogue-${String(counter)}`,
    parent_id: null,
    kind: 'light',
    name: `Device ${String(counter)}`,
    display_name: null,
    model: 'generic.model',
    manufacturer: 'Maker',
    provider_room: null,
    room_id: HALL,
    online: true,
    capabilities: [
      { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    ],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: MOMENT,
    updated_at: MOMENT,
    ...overrides,
  });
}

const rooms: readonly RoomRow[] = [
  { id: STUDY, name: 'Study', position: 2 },
  { id: HALL, name: 'Hall', position: 1 },
  { id: LOUNGE, name: 'Annex', position: 1 },
];

const first = device({});
const second = device({});
const hiddenLight = device({ hidden: true });
const plug = device({ kind: 'plug' });
const soloStudy = device({ room_id: STUDY });
const loungeA = device({ room_id: LOUNGE });
const loungeB = device({ room_id: LOUNGE });
const everyone = [first, second, hiddenLight, plug, soloStudy, loungeA, loungeB];
const byText = (left: string, right: string): number => left.localeCompare(right);

const group: DeviceGroupRow = {
  id: GROUP,
  name: 'Reading',
  device_ids: [second.id, GONE, first.id],
  created_at: MOMENT,
  updated_at: MOMENT,
};

describe('the room lights rule', () => {
  it('needs at least two visible lights in a room', () => {
    expect(ROOM_LIGHTS_MINIMUM).toBe(2);
    const entries = roomLightTargets(everyone, rooms, byText);
    expect(entries.map((entry) => entry.name)).toStrictEqual(['Annex lights', 'Hall lights']);
  });

  it('leaves out hidden lights and other families', () => {
    const [, hall] = roomLightTargets(everyone, rooms, byText);
    expect(hall?.members).toStrictEqual([first, second]);
    expect(roomLightTargets([first, hiddenLight, plug], rooms, byText)).toStrictEqual([]);
  });

  it('orders rooms by position, then by the given text order', () => {
    const reversed = roomLightTargets(everyone, rooms, (left, right) => byText(right, left));
    expect(reversed.map((entry) => entry.name)).toStrictEqual(['Hall lights', 'Annex lights']);
    const lit = [...everyone, device({ room_id: STUDY }), device({ room_id: STUDY })];
    expect(roomLightTargets(lit, rooms, byText).map((entry) => entry.name)).toStrictEqual([
      'Annex lights',
      'Hall lights',
      'Study lights',
    ]);
  });

  it('describes a room lights target by its key, target and name', () => {
    const [annex] = roomLightTargets(everyone, rooms, byText);
    expect(annex).toStrictEqual({
      key: `room-lights:${LOUNGE}`,
      target: { kind: 'room', roomId: LOUNGE, families: ['light'] },
      name: 'Annex lights',
      kind: 'room-lights',
      members: [loungeA, loungeB],
      lost: 0,
    });
    expect(roomLightsTarget(LOUNGE)).toStrictEqual(annex?.target);
    expect(roomLightsName({ name: 'Annex' })).toBe('Annex lights');
  });
});

describe('visible lights', () => {
  it('keeps visible lights only, in the given order', () => {
    expect(visibleLights([plug, second, hiddenLight, first])).toStrictEqual([second, first]);
    expect(visibleLights([plug, hiddenLight])).toStrictEqual([]);
  });

  it('matches the lights a room lights target resolves to', () => {
    const inHall = everyone.filter((candidate) => candidate.room_id === HALL);
    expect(visibleLights(inHall)).toStrictEqual(
      targetDevices(everyone, [], roomLightsTarget(HALL)),
    );
  });
});

describe('named group targets', () => {
  it('lists members in group order and counts the ones that no longer exist', () => {
    const [entry] = groupTargets(everyone, [group]);
    expect(entry).toStrictEqual({
      key: `group:${GROUP}`,
      target: { kind: 'group', groupId: GROUP },
      name: 'Reading',
      kind: 'group',
      members: [second, first],
      lost: 1,
    });
  });

  it('keeps a group whose members are all gone', () => {
    const [entry] = groupTargets([], [group]);
    expect(entry?.members).toStrictEqual([]);
    expect(entry?.lost).toBe(3);
  });
});

describe('finding one target', () => {
  it('finds a group and a room lights target', () => {
    expect(targetEntry(everyone, [group], rooms, { kind: 'group', groupId: GROUP })?.name).toBe(
      'Reading',
    );
    expect(targetEntry(everyone, [group], rooms, roomLightsTarget(HALL))?.members).toStrictEqual([
      first,
      second,
    ]);
  });

  it('returns null for a removed group, an unknown room or a room with one light', () => {
    expect(targetEntry(everyone, [], rooms, { kind: 'group', groupId: GROUP })).toBeNull();
    expect(targetEntry(everyone, [], rooms, roomLightsTarget(GONE))).toBeNull();
    expect(targetEntry(everyone, [], rooms, roomLightsTarget(STUDY))).toBeNull();
  });

  it('returns null for targets that are not in the catalogue', () => {
    expect(targetEntry(everyone, [], rooms, { kind: 'room', roomId: HALL })).toBeNull();
    expect(
      targetEntry(everyone, [], rooms, { kind: 'room', roomId: HALL, families: ['plug'] }),
    ).toBeNull();
    expect(
      targetEntry(everyone, [], rooms, {
        kind: 'room',
        roomId: HALL,
        families: ['light', 'plug'],
      }),
    ).toBeNull();
    expect(targetEntry(everyone, [], rooms, { kind: 'devices', deviceIds: [first.id] })).toBeNull();
  });
});

describe('target keys', () => {
  it('names each kind of target', () => {
    expect(targetKey({ kind: 'group', groupId: GROUP })).toBe(`group:${GROUP}`);
    expect(targetKey({ kind: 'room', roomId: HALL, families: ['light'] })).toBe(
      `room-lights:${HALL}`,
    );
    expect(targetKey({ kind: 'devices', deviceIds: [first.id, second.id] })).toBe(
      `devices:${first.id},${second.id}`,
    );
  });
});
