import { type HomeMap, type HomeMapRoom } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeMapRoomLinks } from '../../src/home-map/room-links';
import type { HomeMapService } from '../../src/home-map/service';
import type { HomeMapApplied } from '../../src/store/repositories/home-maps';
import type { StoredRoomLink } from '../../src/store/repositories/vacuum-room-links';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { DEVICE, NOW, planFor } from './import-fixtures';
import { syntheticScene } from './scene-fixtures';
import { HOME_DEN, HOME_HALL, storedLink, storedService } from './store-fixtures';

const USER = 'profile:me';
const ROBOT = 'source:src-1';

let logs: CapturedLogs;
let service: HomeMapService;
let links: StoredRoomLink[];
let sent: [string, number, number][];
let failing: boolean;
let roomLinks: HomeMapRoomLinks;
let counter: number;

const roomNamed = (name: string): HomeMapRoom => {
  const found = service
    .get()
    .floors.flatMap((floor) => floor.rooms)
    .find((room) => room.name === name);
  if (!found) throw new Error(`no room ${name}`);
  return found;
};

const homeRoomsOf = (): (string | null)[] =>
  service.get().floors[0]?.rooms.map((room) => room.homeRoomId) ?? [];

const recolour = (
  name: string,
  kind: string,
  variant: string | null,
  actor = USER,
): HomeMapApplied =>
  service.apply(
    [
      {
        op: 'update',
        kind: 'room',
        floorId: 'floor-0',
        id: roomNamed(name).id,
        patch: { floorMaterial: { kind, variant, tint: null } },
      },
    ],
    actor,
  );

beforeEach(() => {
  logs = captureLogs();
  service = storedService();
  links = [];
  sent = [];
  failing = false;
  counter = 0;
  const plan = planFor(service.get(), syntheticScene);
  if (plan.kind === 'noop') throw new Error('no import');
  service.apply(plan.ops, plan.actor);
  roomLinks = new HomeMapRoomLinks({
    maps: service,
    links: { list: (): StoredRoomLink[] => links },
    setRoomFloor: (deviceId, mapRoomId, floor): Promise<void> => {
      if (failing) return Promise.reject(new Error('robot offline'));
      sent.push([deviceId, mapRoomId, floor]);
      return Promise.resolve();
    },
    newId: (): string => `link-${String((counter += 1))}`,
    now: (): string => NOW,
    log: testLogger('home-map'),
  });
});

describe('room links derived from the robot links', () => {
  it('puts the linked home rooms on the map rooms as the robot source, in one revision', () => {
    links = [storedLink(1, HOME_HALL, 'Hall'), storedLink(2, HOME_DEN, 'Den')];
    expect(roomLinks.sync(DEVICE)).toBe(1);
    expect(homeRoomsOf()).toEqual([HOME_HALL, HOME_DEN]);
    expect(service.revision()).toBe(2);
    expect(service.revisions({ after: 1 }).map((entry) => entry.actor)).toEqual([ROBOT]);
    expect(roomNamed('Hall').origin).toMatchObject({ overridden: [] });
  });

  it('makes no revision when nothing changed', () => {
    links = [storedLink(1, HOME_HALL, 'Hall')];
    roomLinks.sync(DEVICE);
    const before = service.revision();
    expect(roomLinks.sync(DEVICE)).toBe(0);
    expect(service.revision()).toBe(before);
  });

  it('clears the home room when the robot room is unlinked', () => {
    links = [storedLink(1, HOME_HALL, 'Hall')];
    roomLinks.sync(DEVICE);
    links = [];
    roomLinks.sync(DEVICE);
    expect(homeRoomsOf()).toEqual([null, null]);
  });

  it('moves a link between map rooms', () => {
    links = [storedLink(1, HOME_HALL, 'Hall')];
    roomLinks.sync(DEVICE);
    links = [storedLink(2, HOME_HALL, 'Hall')];
    roomLinks.sync(DEVICE);
    expect(homeRoomsOf()).toEqual([null, HOME_HALL]);
  });

  it('does nothing for a robot that is not a source of the map', () => {
    links = [storedLink(1, HOME_HALL, 'Hall')];
    expect(roomLinks.sync('9c3e2f50-4d6b-4e8c-8fb0-2b3c4d5e6f70')).toBe(0);
    expect(homeRoomsOf()).toEqual([null, null]);
  });

  it('never takes a home room that a hand room holds on the same floor, and says so', () => {
    const floor = service.get().floors[0];
    service.apply(
      [
        {
          op: 'add',
          kind: 'room',
          floorId: 'floor-0',
          element: {
            id: 'hand-1',
            name: 'Study',
            homeRoomId: HOME_HALL,
            polygon: { outer: floor?.rooms[0]?.polygon.outer ?? [], holes: [] },
            labelAt: { x: 1, y: 1 },
            colourSlot: 1,
            floorMaterial: { kind: 'plain', variant: null, tint: null },
            wallPaint: null,
            ceilingHeight: null,
            origin: { kind: 'hand' },
          },
        },
      ],
      USER,
    );
    links = [storedLink(1, HOME_HALL, 'Hall')];
    roomLinks.sync(DEVICE);
    expect(roomNamed('Hall').homeRoomId).toBeNull();
    expect(roomNamed('Study').homeRoomId).toBe(HOME_HALL);
    expect(logs.events()).toContain('home_map.room_link_taken');
  });
});

describe('stale links', () => {
  const noticesOf = (map: HomeMap): string[] =>
    map.notices.filter((n) => n.kind === 'link_stale').map((n) => `${n.elementId}:${n.detail}`);

  it('keeps the home room and raises one notice on the room, then clears it when the room returns', () => {
    links = [storedLink(1, HOME_HALL, 'Hall')];
    roomLinks.sync(DEVICE);
    links = [storedLink(1, HOME_HALL, 'Hall', NOW)];
    roomLinks.sync(DEVICE);
    roomLinks.sync(DEVICE);
    expect(roomNamed('Hall').homeRoomId).toBe(HOME_HALL);
    expect(noticesOf(service.get())).toEqual([
      `${roomNamed('Hall').id}:The robot's map no longer has Robot 1. It was linked to Hall.`,
    ]);
    links = [storedLink(1, HOME_HALL, 'Hall')];
    roomLinks.sync(DEVICE);
    expect(noticesOf(service.get())).toEqual([]);
  });

  it('clears the notice when the link is removed altogether', () => {
    links = [storedLink(1, HOME_HALL, 'Hall', NOW)];
    roomLinks.sync(DEVICE);
    expect(noticesOf(service.get())).toHaveLength(1);
    links = [];
    roomLinks.sync(DEVICE);
    expect(noticesOf(service.get())).toEqual([]);
    expect(roomNamed('Hall').homeRoomId).toBeNull();
  });
});

describe('writing the material through to the robot', () => {
  it('sends a material the robot knows to its room through the room settings command', async () => {
    const outcomes = await roomLinks.writeThrough(recolour('Den', 'marble', null), USER);
    expect(outcomes).toEqual([{ roomId: roomNamed('Den').id, status: 'sent', floor: 4030 }]);
    expect(sent).toEqual([[DEVICE, 2, 4030]]);
  });

  it('sends the same material for the variants the robot knows', async () => {
    await roomLinks.writeThrough(recolour('Den', 'wood', 'horizontal'), USER);
    expect(sent).toEqual([[DEVICE, 2, 4011]]);
  });

  it('does not resend the floor the robot already has', async () => {
    const outcomes = await roomLinks.writeThrough(recolour('Hall', 'wood', null), USER);
    expect(outcomes.map((o) => o.status)).toEqual(['unchanged']);
    expect(sent).toEqual([]);
  });

  it('sends nothing for a material the robot does not know and keeps the map as picked', async () => {
    const outcomes = await roomLinks.writeThrough(recolour('Den', 'carpet', 'shag'), USER);
    expect(outcomes.map((o) => o.status)).toEqual(['unknown_to_robot']);
    expect(sent).toEqual([]);
    expect(roomNamed('Den').floorMaterial).toMatchObject({ kind: 'carpet', variant: 'shag' });
  });

  it('sends nothing for a room that is not the robot map room', async () => {
    const floor = service.get().floors[0];
    const applied = service.apply(
      [
        {
          op: 'add',
          kind: 'room',
          floorId: 'floor-0',
          element: {
            id: 'hand-1',
            name: 'Study',
            homeRoomId: null,
            polygon: { outer: floor?.rooms[0]?.polygon.outer ?? [], holes: [] },
            labelAt: { x: 1, y: 1 },
            colourSlot: 1,
            floorMaterial: { kind: 'plain', variant: null, tint: null },
            wallPaint: null,
            ceilingHeight: null,
            origin: { kind: 'hand' },
          },
        },
      ],
      USER,
    );
    expect(await roomLinks.writeThrough(applied, USER)).toEqual([]);
    const recoloured = service.apply(
      [
        {
          op: 'update',
          kind: 'room',
          floorId: 'floor-0',
          id: 'hand-1',
          patch: { floorMaterial: { kind: 'marble', variant: null, tint: null } },
        },
      ],
      USER,
    );
    const outcomes = await roomLinks.writeThrough(recoloured, USER);
    expect(outcomes.map((o) => o.status)).toEqual(['not_a_robot_room']);
    expect(sent).toEqual([]);
  });

  it('never writes back what the robot itself imported', async () => {
    const outcomes = await roomLinks.writeThrough(recolour('Den', 'marble', null, ROBOT), ROBOT);
    expect(outcomes).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('reports a failed robot write in the log without undoing the map edit', async () => {
    failing = true;
    const outcomes = await roomLinks.writeThrough(recolour('Den', 'marble', null), USER);
    expect(outcomes).toEqual([
      { roomId: roomNamed('Den').id, status: 'failed', error: 'Error: robot offline' },
    ]);
    expect(logs.events()).toContain('home_map.robot_floor_write_failed');
    expect(roomNamed('Den').floorMaterial).toMatchObject({ kind: 'marble' });
  });

  it('ignores edits that do not touch the floor material', async () => {
    const applied = service.apply(
      [
        {
          op: 'update',
          kind: 'room',
          floorId: 'floor-0',
          id: roomNamed('Den').id,
          patch: { name: 'Study' },
        },
      ],
      USER,
    );
    expect(await roomLinks.writeThrough(applied, USER)).toEqual([]);
  });
});
