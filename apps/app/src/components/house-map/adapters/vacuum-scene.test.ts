import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { VACUUM_FLOOR_ID, vacuumRenderScene, vacuumRoomPolygons } from './vacuum-scene';

const FIXTURE = new URL(
  '../../../../../../packages/domain/test/fixtures/vacuum-scene-pv11gl.json',
  import.meta.url,
);

const fixture: VacuumScene = VACUUM_SCENE.parse(JSON.parse(readFileSync(FIXTURE, 'utf8')));

type Ring = VacuumScene['rooms'][number]['rings'][number];

const square = (x: number, y: number, size: number, clockwise = false): Ring => {
  const ring = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
  return clockwise ? ring.reverse() : ring;
};

const room = (
  id: number,
  rings: Ring[],
  floor: number,
  colour = id,
): VacuumScene['rooms'][number] => ({
  id,
  name: `Room ${String(id)}`,
  colour,
  floor,
  hidden: false,
  areaM2: 1,
  label: { x: 0, y: 0 },
  rings,
  settings: null,
});

const synthetic: VacuumScene = {
  ...fixture,
  rooms: [
    room(1, [square(0, 0, 4), square(1, 1, 1, true), square(10, 0, 1)], 4010, 9),
    room(2, [square(4, 0, 3)], 4999, -1),
    room(3, [square(0, 5, 2)], 0),
  ],
  doors: [
    { from: { x: 4, y: 1 }, to: { x: 4, y: 2 }, kind: 'opening', rooms: [1, 2] },
    { from: { x: 4, y: 2 }, to: { x: 4, y: 3 }, kind: 'robot_gate', rooms: [1] },
  ],
  furniture: [
    { id: 7, kind: 'double_bed', ring: square(2, 2, 1), height: 0.5 },
    { id: 8, kind: 'hammock', ring: square(5, 1, 1), height: null },
  ],
  objects: [{ id: 3, kind: 'shoes', at: { x: 1, y: 3 }, label: null }],
  zones: [{ id: 4, kind: 'no_go', points: square(5, 2, 1) }],
  robot: { x: 1, y: 1, yaw: Math.PI / 2 },
  dock: { x: 0, y: 0, yaw: -Math.PI },
  trail: [
    {
      mopping: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
  ],
};

describe('vacuumRenderScene', () => {
  it('keeps every room, wall, door and carpet of the synthetic fixture', () => {
    const scene = vacuumRenderScene({ scene: fixture });
    const [floor] = scene.floors;
    expect(scene.source).toBe('vacuum');
    expect(scene.floors).toHaveLength(1);
    expect(floor?.id).toBe(VACUUM_FLOOR_ID);
    expect(floor?.rooms).toHaveLength(fixture.rooms.length);
    expect(floor?.walls).toHaveLength(fixture.walls.length);
    expect(floor?.openings).toHaveLength(fixture.doors.length);
    expect(floor?.carpets).toHaveLength(fixture.carpets.length);
    expect(scene.bounds).toEqual(fixture.bounds);
    const exterior = fixture.walls.filter((wall) => wall.kind === 'exterior').length;
    expect(floor?.walls.filter((wall) => wall.exterior)).toHaveLength(exterior);
    expect(new Set(floor?.walls.map((wall) => wall.id)).size).toBe(fixture.walls.length);
  });

  it('splits room rings into parts and holes, largest part first', () => {
    const polygons = vacuumRoomPolygons(synthetic.rooms[0]?.rings ?? []);
    expect(polygons).toHaveLength(2);
    expect(polygons[0]?.outer).toEqual(square(0, 0, 4));
    expect(polygons[0]?.holes).toEqual([square(1, 1, 1, true)]);
    expect(polygons[1]?.holes).toEqual([]);
  });

  it('maps floor codes, colour slots and keeps unknown floor codes as numbers', () => {
    const rooms = vacuumRenderScene({ scene: synthetic }).floors[0]?.rooms ?? [];
    expect(rooms.map((item) => item.floor)).toEqual([
      { status: 'material', kind: 'wood', variant: null, tint: null },
      { status: 'unknown', code: 4999, label: 'Robot floor type 4999' },
      { status: 'none' },
    ]);
    expect(rooms.map((item) => item.colourSlot)).toEqual([2, 8, 4]);
  });

  it('maps furniture to catalogue ids, keeps unknown kinds and finds their rooms', () => {
    const floor = vacuumRenderScene({ scene: synthetic }).floors[0];
    expect(
      floor?.objects.map(({ modelId, kind, roomId, at }) => ({ modelId, kind, roomId, at })),
    ).toEqual([
      { modelId: 'cat.bedroom.queen-bed', kind: 'double_bed', roomId: '1', at: { x: 2.5, y: 2.5 } },
      { modelId: null, kind: 'hammock', roomId: '2', at: { x: 5.5, y: 1.5 } },
    ]);
    expect(floor?.objects[0]?.footprint).toEqual(square(2, 2, 1));
    expect(floor?.markers).toEqual([
      { id: 'object:3', kind: 'shoes', at: { x: 1, y: 3 }, label: null },
    ]);
  });

  it('keeps door kinds, room ids and the robot frame in degrees', () => {
    const floor = vacuumRenderScene({ scene: synthetic }).floors[0];
    expect(
      floor?.openings.map(({ kind, sourceKind, roomIds }) => ({ kind, sourceKind, roomIds })),
    ).toEqual([
      { kind: 'opening', sourceKind: 'opening', roomIds: ['1', '2'] },
      { kind: 'opening', sourceKind: 'robot_gate', roomIds: ['1'] },
    ]);
    expect(floor?.vacuum?.robot).toEqual({ x: 1, y: 1, yawDeg: 90 });
    expect(floor?.vacuum?.dock).toEqual({ x: 0, y: 0, yawDeg: -180 });
    expect(floor?.vacuum?.trail).toEqual(synthetic.trail);
    expect(floor?.vacuum?.zones).toEqual([
      { id: 'zone:4', kind: 'no_go', points: square(5, 2, 1) },
    ]);
  });

  it('names linked rooms after their home room and changes the key when a link changes', () => {
    const unlinked = vacuumRenderScene({ scene: synthetic });
    const linked = vacuumRenderScene({
      scene: synthetic,
      roomLink: (id) =>
        id === 1 ? { homeRoomId: '0b9f7a52-0f1c-4b55-9d2a-1f6a2b3c4d5e', name: 'Kitchen' } : null,
    });
    const first = linked.floors[0]?.rooms[0];
    expect(first?.name).toBe('Kitchen');
    expect(first?.homeRoomId).toBe('0b9f7a52-0f1c-4b55-9d2a-1f6a2b3c4d5e');
    expect(linked.floors[0]?.rooms[1]?.name).toBe('Room 2');
    expect(unlinked.key).not.toBe(linked.key);
    expect(unlinked.key.startsWith(`vacuum:${String(synthetic.index)}:${synthetic.slot}:`)).toBe(
      true,
    );
    expect(vacuumRenderScene({ scene: synthetic }).key).toBe(unlinked.key);
  });
});
