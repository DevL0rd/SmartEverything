import {
  VACUUM_ROOM_LINKS_SUMMARY,
  type JsonValue,
  type RoomRow,
  type VacuumScene,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VacuumRoomLinks } from '../../src/vacuum/room-links';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { fixtureRoom, sceneWith, vacuumDevice } from './room-link-bench';

let opened: TestStore;
let robot: string;
let otherRobot: string;
let scenes: Map<string, VacuumScene>;
let published: Map<string, JsonValue>;
let publishes: number;
let service: VacuumRoomLinks;
let kitchen: RoomRow;
let hall: RoomRow;

const FIRST = fixtureRoom(0);
const SECOND = fixtureRoom(1);
const THIRD = fixtureRoom(2);

function show(deviceId: string, scene: VacuumScene): void {
  scenes.set(deviceId, scene);
  service.sceneChanged(deviceId, scene);
}

function summary(deviceId: string): unknown {
  const text = published.get(deviceId);
  return typeof text === 'string' ? VACUUM_ROOM_LINKS_SUMMARY.parse(JSON.parse(text)) : null;
}

beforeEach(async () => {
  opened = await testStore();
  robot = vacuumDevice(opened, 'robot');
  otherRobot = vacuumDevice(opened, 'other-robot');
  scenes = new Map();
  published = new Map();
  publishes = 0;
  kitchen = opened.store.rooms.create('Kitchen', 0);
  hall = opened.store.rooms.create('Hallway', 1);
  service = new VacuumRoomLinks({
    links: opened.store.vacuumRoomLinks,
    rooms: opened.store.rooms,
    scene: (deviceId): VacuumScene | undefined => scenes.get(deviceId),
    stored: (deviceId): JsonValue | undefined => published.get(deviceId),
    publish: (deviceId, text): void => {
      publishes += 1;
      published.set(deviceId, text);
    },
    log: testLogger(),
  });
});

afterEach(async () => {
  await opened.close();
});

describe('the vacuum room links', () => {
  it('keep a link by map room id across map re-fetches and index changes', () => {
    show(robot, sceneWith(10, [FIRST, SECOND]));
    service.link(robot, sceneWith(10, [FIRST, SECOND]), {
      mapRoomId: FIRST.id,
      roomId: kitchen.id,
      move: false,
    });
    show(robot, sceneWith(11, [FIRST, SECOND]));
    show(robot, sceneWith(12, [SECOND, FIRST]));
    const links = service.list(robot, sceneWith(12, [SECOND, FIRST]));
    expect(links.rooms.find((room) => room.mapRoomId === FIRST.id)?.homeRoom).toStrictEqual({
      id: kitchen.id,
      name: 'Kitchen',
    });
    expect(links.unlinked).toBe(1);
    expect(summary(robot)).toMatchObject({ linked: 1, unlinked: 1, stale: 0 });
  });

  it('mark a link stale when its map room disappears, and leave a new map room unlinked', () => {
    show(robot, sceneWith(10, [FIRST, SECOND]));
    service.link(robot, sceneWith(10, [FIRST, SECOND]), {
      mapRoomId: SECOND.id,
      roomId: hall.id,
      move: false,
    });
    const changed = sceneWith(11, [FIRST, THIRD]);
    show(robot, changed);
    const links = service.list(robot, changed);
    expect(links.stale).toStrictEqual([
      {
        mapRoomId: SECOND.id,
        mapRoomName: SECOND.name,
        homeRoom: { id: hall.id, name: 'Hallway' },
        missingSince: changed.fetchedAt,
      },
    ]);
    expect(links.rooms.map((room) => room.homeRoom)).toStrictEqual([null, null]);
    expect(links.homeRooms.find((room) => room.id === hall.id)?.usedBy).toStrictEqual({
      mapRoomId: SECOND.id,
      mapRoomName: SECOND.name,
      stale: true,
    });
    expect(summary(robot)).toMatchObject({ linked: 0, unlinked: 2, stale: 1 });
  });

  it('clear the stale mark when the map room comes back', () => {
    show(robot, sceneWith(10, [FIRST]));
    service.link(robot, sceneWith(10, [FIRST]), {
      mapRoomId: FIRST.id,
      roomId: kitchen.id,
      move: false,
    });
    show(robot, sceneWith(11, [SECOND]));
    show(robot, sceneWith(12, [FIRST, SECOND]));
    expect(service.list(robot, sceneWith(12, [FIRST, SECOND])).stale).toStrictEqual([]);
    expect(summary(robot)).toMatchObject({ linked: 1, unlinked: 1, stale: 0 });
  });

  it('refuse a home room another map room uses unless the link is moved', () => {
    const scene = sceneWith(10, [FIRST, SECOND]);
    show(robot, scene);
    service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    expect(() =>
      service.link(robot, scene, { mapRoomId: SECOND.id, roomId: kitchen.id, move: false }),
    ).toThrow(expect.objectContaining({ code: 'conflict' }));
    const moved = service.link(robot, scene, {
      mapRoomId: SECOND.id,
      roomId: kitchen.id,
      move: true,
    });
    expect(moved.rooms.map((room) => [room.mapRoomId, room.homeRoom?.id ?? null])).toStrictEqual([
      [FIRST.id, null],
      [SECOND.id, kitchen.id],
    ]);
  });

  it('let each robot link the same home room to its own map room', () => {
    const scene = sceneWith(10, [FIRST]);
    service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    service.link(otherRobot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    expect(service.list(otherRobot, scene).rooms[0]?.homeRoom?.id).toBe(kitchen.id);
    expect(service.list(robot, scene).rooms[0]?.homeRoom?.id).toBe(kitchen.id);
  });

  it('refuse a map room the map does not have and a home room the home does not have', () => {
    const scene = sceneWith(10, [FIRST]);
    expect(() =>
      service.link(robot, scene, { mapRoomId: SECOND.id, roomId: kitchen.id, move: false }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(() =>
      service.link(robot, scene, {
        mapRoomId: FIRST.id,
        roomId: '00000000-0000-4000-8000-000000000000',
        move: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('suggest home rooms by name without linking them', () => {
    opened.store.rooms.create(FIRST.name, 2);
    const scene = sceneWith(10, [FIRST, SECOND]);
    show(robot, scene);
    const links = service.list(robot, scene);
    expect(links.rooms.map((room) => [room.suggestion?.name ?? null, room.homeRoom])).toStrictEqual(
      [
        [FIRST.name, null],
        [null, null],
      ],
    );
    expect(links.unlinked).toBe(2);
    expect(opened.store.vacuumRoomLinks.list(robot)).toStrictEqual([]);
  });

  it('drop the link with the home room it pointed at', () => {
    const scene = sceneWith(10, [FIRST]);
    show(robot, scene);
    service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    opened.store.rooms.remove(kitchen.id, () => undefined);
    service.publish(robot);
    expect(service.list(robot, scene).rooms[0]?.homeRoom).toBeNull();
    expect(summary(robot)).toMatchObject({ linked: 0, unlinked: 1, stale: 0 });
  });

  it('unlink a map room and refuse a room that is not linked', () => {
    const scene = sceneWith(10, [FIRST]);
    show(robot, scene);
    service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    expect(service.unlink(robot, scene, FIRST.id).unlinked).toBe(1);
    expect(() => service.unlink(robot, scene, FIRST.id)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('publish the summary only when it changes', () => {
    show(robot, sceneWith(10, [FIRST]));
    show(robot, sceneWith(11, [FIRST]));
    service.attached(robot);
    expect(publishes).toBe(1);
    expect(summary(robot)).toMatchObject({ linked: 0, unlinked: 1, stale: 0 });
  });

  it('raise the revision when a link moves to another home room with the same counts', () => {
    const scene = sceneWith(10, [FIRST, SECOND]);
    show(robot, scene);
    service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    const before = summary(robot);
    service.link(robot, scene, { mapRoomId: FIRST.id, roomId: hall.id, move: false });
    const after = summary(robot);
    expect(after).toMatchObject({ linked: 1, unlinked: 1, stale: 0 });
    expect(after).not.toStrictEqual(before);
    service.publish(robot);
    expect(summary(robot)).toStrictEqual(after);
  });

  it('decorate the scene with the linked home room and the unlinked count', () => {
    const scene = sceneWith(10, [FIRST, SECOND]);
    service.link(robot, scene, { mapRoomId: SECOND.id, roomId: hall.id, move: false });
    const answer = service.decorate(robot, scene);
    expect(answer.rooms.map((room) => room.homeRoom)).toStrictEqual([
      null,
      { id: hall.id, name: 'Hallway' },
    ]);
    expect(answer.unlinkedRooms).toBe(1);
  });
});
