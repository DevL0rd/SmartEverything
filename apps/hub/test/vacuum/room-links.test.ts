import {
  VACUUM_ROOM_LINKS_SUMMARY,
  type JsonValue,
  type RoomRow,
  type VacuumScene,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hostRoomLinks, VacuumRoomLinks } from '../../src/vacuum/room-links';
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

async function show(deviceId: string, scene: VacuumScene): Promise<void> {
  scenes.set(deviceId, scene);
  service.sceneChanged(deviceId, scene);
  await service.settled(deviceId);
}

async function summary(deviceId: string): Promise<unknown> {
  await service.settled(deviceId);
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
    links: hostRoomLinks(opened.store.host),
    rooms: opened.store.live.home.rooms,
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
  it('keep a link by map room id across map re-fetches and index changes', async () => {
    await show(robot, sceneWith(10, [FIRST, SECOND]));
    await service.link(robot, sceneWith(10, [FIRST, SECOND]), {
      mapRoomId: FIRST.id,
      roomId: kitchen.id,
      move: false,
    });
    await show(robot, sceneWith(11, [FIRST, SECOND]));
    await show(robot, sceneWith(12, [SECOND, FIRST]));
    const links = await service.list(robot, sceneWith(12, [SECOND, FIRST]));
    expect(links.rooms.find((room) => room.mapRoomId === FIRST.id)?.homeRoom).toStrictEqual({
      id: kitchen.id,
      name: 'Kitchen',
    });
    expect(links.unlinked).toBe(1);
    expect(await summary(robot)).toMatchObject({ linked: 1, unlinked: 1, stale: 0 });
  });

  it('mark a link stale when its map room disappears, and leave a new map room unlinked', async () => {
    await show(robot, sceneWith(10, [FIRST, SECOND]));
    await service.link(robot, sceneWith(10, [FIRST, SECOND]), {
      mapRoomId: SECOND.id,
      roomId: hall.id,
      move: false,
    });
    const changed = sceneWith(11, [FIRST, THIRD]);
    await show(robot, changed);
    const links = await service.list(robot, changed);
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
    expect(await summary(robot)).toMatchObject({ linked: 0, unlinked: 2, stale: 1 });
  });

  it('clear the stale mark when the map room comes back', async () => {
    await show(robot, sceneWith(10, [FIRST]));
    await service.link(robot, sceneWith(10, [FIRST]), {
      mapRoomId: FIRST.id,
      roomId: kitchen.id,
      move: false,
    });
    await show(robot, sceneWith(11, [SECOND]));
    await show(robot, sceneWith(12, [FIRST, SECOND]));
    expect((await service.list(robot, sceneWith(12, [FIRST, SECOND]))).stale).toStrictEqual([]);
    expect(await summary(robot)).toMatchObject({ linked: 1, unlinked: 1, stale: 0 });
  });

  it('refuse a home room another map room uses unless the link is moved', async () => {
    const scene = sceneWith(10, [FIRST, SECOND]);
    await show(robot, scene);
    await service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    await expect(
      service.link(robot, scene, { mapRoomId: SECOND.id, roomId: kitchen.id, move: false }),
    ).rejects.toThrow(expect.objectContaining({ code: 'conflict' }));
    const moved = await service.link(robot, scene, {
      mapRoomId: SECOND.id,
      roomId: kitchen.id,
      move: true,
    });
    expect(moved.rooms.map((room) => [room.mapRoomId, room.homeRoom?.id ?? null])).toStrictEqual([
      [FIRST.id, null],
      [SECOND.id, kitchen.id],
    ]);
  });

  it('let each robot link the same home room to its own map room', async () => {
    const scene = sceneWith(10, [FIRST]);
    await service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    await service.link(otherRobot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    expect((await service.list(otherRobot, scene)).rooms[0]?.homeRoom?.id).toBe(kitchen.id);
    expect((await service.list(robot, scene)).rooms[0]?.homeRoom?.id).toBe(kitchen.id);
  });

  it('refuse a map room the map does not have and a home room the home does not have', async () => {
    const scene = sceneWith(10, [FIRST]);
    await expect(
      service.link(robot, scene, { mapRoomId: SECOND.id, roomId: kitchen.id, move: false }),
    ).rejects.toThrow(expect.objectContaining({ code: 'not_found' }));
    await expect(
      service.link(robot, scene, {
        mapRoomId: FIRST.id,
        roomId: '00000000-0000-4000-8000-000000000000',
        move: false,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('suggest home rooms by name without linking them', async () => {
    opened.store.rooms.create(FIRST.name, 2);
    const scene = sceneWith(10, [FIRST, SECOND]);
    await show(robot, scene);
    const links = await service.list(robot, scene);
    expect(links.rooms.map((room) => [room.suggestion?.name ?? null, room.homeRoom])).toStrictEqual(
      [
        [FIRST.name, null],
        [null, null],
      ],
    );
    expect(links.unlinked).toBe(2);
    expect(opened.store.vacuumRoomLinks.list(robot)).toStrictEqual([]);
  });

  it('drop the link with the home room it pointed at', async () => {
    const scene = sceneWith(10, [FIRST]);
    await show(robot, scene);
    await service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    opened.store.rooms.remove(kitchen.id, () => undefined);
    service.publish(robot);
    await service.settled(robot);
    expect((await service.list(robot, scene)).rooms[0]?.homeRoom).toBeNull();
    expect(await summary(robot)).toMatchObject({ linked: 0, unlinked: 1, stale: 0 });
  });

  it('unlink a map room and refuse a room that is not linked', async () => {
    const scene = sceneWith(10, [FIRST]);
    await show(robot, scene);
    await service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    expect((await service.unlink(robot, scene, FIRST.id)).unlinked).toBe(1);
    await expect(service.unlink(robot, scene, FIRST.id)).rejects.toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('publish the summary only when it changes', async () => {
    await show(robot, sceneWith(10, [FIRST]));
    await show(robot, sceneWith(11, [FIRST]));
    service.attached(robot);
    await service.settled(robot);
    expect(publishes).toBe(1);
    expect(await summary(robot)).toMatchObject({ linked: 0, unlinked: 1, stale: 0 });
  });

  it('raise the revision when a link moves to another home room with the same counts', async () => {
    const scene = sceneWith(10, [FIRST, SECOND]);
    await show(robot, scene);
    await service.link(robot, scene, { mapRoomId: FIRST.id, roomId: kitchen.id, move: false });
    const before = await summary(robot);
    await service.link(robot, scene, { mapRoomId: FIRST.id, roomId: hall.id, move: false });
    const after = await summary(robot);
    expect(after).toMatchObject({ linked: 1, unlinked: 1, stale: 0 });
    expect(after).not.toStrictEqual(before);
    service.publish(robot);
    await service.settled(robot);
    expect(await summary(robot)).toStrictEqual(after);
  });

  it('decorate the scene with the linked home room and the unlinked count', async () => {
    const scene = sceneWith(10, [FIRST, SECOND]);
    await service.link(robot, scene, { mapRoomId: SECOND.id, roomId: hall.id, move: false });
    const answer = await service.decorate(robot, scene);
    expect(answer.rooms.map((room) => room.homeRoom)).toStrictEqual([
      null,
      { id: hall.id, name: 'Hallway' },
    ]);
    expect(answer.unlinkedRooms).toBe(1);
  });
});
