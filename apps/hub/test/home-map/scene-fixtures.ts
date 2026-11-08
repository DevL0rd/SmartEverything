import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';

export const fixtureScene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/domain/test/fixtures/vacuum-scene-pv11gl.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

interface Point {
  readonly x: number;
  readonly y: number;
}

export type SceneRing = VacuumScene['carpets'][number]['ring'];

export const rectRing = (x0: number, y0: number, x1: number, y1: number): SceneRing => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

export function rotatePoint(point: Point, deg: number, dx: number, dy: number): Point {
  const cos = Math.cos((deg * Math.PI) / 180);
  const sin = Math.sin((deg * Math.PI) / 180);
  return { x: cos * point.x - sin * point.y + dx, y: sin * point.x + cos * point.y + dy };
}

export function rotateScene(scene: VacuumScene, deg: number, dx = 0, dy = 0): VacuumScene {
  const at = (point: Point): Point => rotatePoint(point, deg, dx, dy);
  const ring = (points: SceneRing): SceneRing => points.map(at);
  return {
    ...scene,
    rooms: scene.rooms.map((room) => ({
      ...room,
      label: at(room.label),
      rings: room.rings.map(ring),
    })),
    walls: scene.walls.map((wall) => ({ ...wall, from: at(wall.from), to: at(wall.to) })),
    doors: scene.doors.map((door) => ({ ...door, from: at(door.from), to: at(door.to) })),
    carpets: scene.carpets.map((carpet) => ({ ...carpet, ring: ring(carpet.ring) })),
    furniture: scene.furniture.map((item) => ({ ...item, ring: ring(item.ring) })),
    dock: scene.dock ? { ...at(scene.dock), yaw: scene.dock.yaw + (deg * Math.PI) / 180 } : null,
  };
}

const room = (
  id: number,
  name: string,
  ring: SceneRing,
  floor = 0,
): VacuumScene['rooms'][number] => ({
  id,
  name,
  colour: 1,
  floor,
  hidden: false,
  areaM2: 1,
  label: { x: (ring[0]?.x ?? 0) + 0.5, y: (ring[0]?.y ?? 0) + 0.5 },
  rings: [ring],
  settings: null,
});

export const syntheticScene: VacuumScene = {
  ...fixtureScene,
  index: 7,
  name: 'Synthetic',
  bounds: { minX: 0, minY: 0, maxX: 8.1, maxY: 3 },
  rooms: [
    room(1, 'Hall', rectRing(0, 0, 4, 3), 4010),
    room(2, 'Den', rectRing(4.1, 0, 8.1, 3), 9999),
  ],
  walls: [
    { from: { x: 4.05, y: 0 }, to: { x: 4.05, y: 3 }, kind: 'interior', height: null },
    { from: { x: 0, y: 0 }, to: { x: 8.1, y: 0 }, kind: 'exterior', height: null },
  ],
  doors: [{ from: { x: 4.05, y: 1 }, to: { x: 4.05, y: 1.9 }, kind: 'opening', rooms: [1, 2] }],
  carpets: [{ id: 1, kind: 'ai', ring: rectRing(1, 1, 2.5, 2) }],
  furniture: [
    { id: 1, kind: 'single_bed', ring: rectRing(5, 0.2, 7, 1.1), height: 0.5 },
    { id: 2, kind: 'strange_gadget', ring: rectRing(0.3, 0.3, 0.8, 0.9), height: 0.7 },
  ],
  objects: [],
  zones: [],
  dock: { x: 0.5, y: 2.5, yaw: Math.PI / 2 },
  robot: null,
  trail: [],
};

export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}
