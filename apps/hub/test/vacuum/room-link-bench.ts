import { VACUUM_ROOM, type VacuumRoom, type VacuumScene } from '@smarteverything/domain';
import { z } from 'zod';
import type { TestStore } from '../support/store';
import { readVacuumFixture } from '../support/fake-vacuum';
import { sceneOf } from './clean-bench';

const ROOM_ATTRS = z.object({
  room_attrs: z.array(z.object({ id: z.number().int(), room_name: z.string() })),
});

export const FIXTURE_ROOMS = readVacuumFixture('maps/pv11gl-current.json', ROOM_ATTRS)
  .room_attrs.map((room) => ({ id: room.id, name: room.room_name }))
  .sort((a, b) => a.id - b.id);

export function fixtureRoom(position: number): { readonly id: number; readonly name: string } {
  const room = FIXTURE_ROOMS[position];
  if (room === undefined) throw new Error(`The map fixture has no room at ${String(position)}`);
  return room;
}

export function mapRoom(id: number, name: string): VacuumRoom {
  return VACUUM_ROOM.parse({
    id,
    name,
    colour: id,
    floor: 0,
    hidden: false,
    areaM2: id * 2,
    label: { x: 1, y: 1 },
    rings: [],
    settings: null,
  });
}

export function sceneWith(
  index: number,
  rooms: readonly { readonly id: number; readonly name: string }[],
): VacuumScene {
  return {
    ...sceneOf(index),
    fetchedAt: `2026-10-24T08:${String(index % 60).padStart(2, '0')}:00.000Z`,
    rooms: rooms.map((room) => mapRoom(room.id, room.name)),
  };
}

export function vacuumDevice(opened: TestStore, externalId: string): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId,
      parentId: null,
      kind: 'vacuum',
      name: externalId,
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('The test vacuum was not stored');
  return row.id;
}
