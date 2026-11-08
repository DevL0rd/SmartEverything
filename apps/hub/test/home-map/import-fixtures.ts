import {
  HOME_MAP_SCHEMA_VERSION,
  HOME_MAP_WRITE,
  applyHomeMapEdits,
  vacuumSceneToSourceGeometry,
  type HomeMap,
  type HomeMapActor,
  type HomeMapFloor,
  type HomeMapOp,
  type VacuumScene,
} from '@smarteverything/domain';
import { expect } from 'vitest';
import { planImport, type FrameCheck, type ImportPlan } from '../../src/home-map/merge/pipeline';
import { rectRing, syntheticScene, type SceneRing } from './scene-fixtures';

export const DEVICE = '3f2b8c1e-5d4a-4b6f-9a77-1c2d3e4f5a6b';
export const NOW = '2026-10-25T10:00:00.000Z';
export const ROBOT: HomeMapActor = 'source:src-1';
export const USER: HomeMapActor = 'profile:me';

let counter = 0;
export const newId = (): string => `n-${String((counter += 1))}`;

export const keepFrame: FrameCheck = () => ({ kind: 'keep' });

export const emptyMap = (): HomeMap =>
  HOME_MAP_WRITE.parse({
    id: 'home',
    schemaVersion: HOME_MAP_SCHEMA_VERSION,
    revision: 0,
    name: 'Home',
    north: 0,
    updatedAt: NOW,
    floors: [],
    sources: [],
    notices: [],
  });

export const planFor = (
  map: HomeMap,
  scene: VacuumScene,
  frameCheck: FrameCheck = keepFrame,
): ImportPlan =>
  planImport({
    map,
    geometry: vacuumSceneToSourceGeometry(scene),
    sourceKind: 'xiaomi_vacuum',
    sourceId: 'src-1',
    deviceId: DEVICE,
    floorId: 'floor-0',
    importedAt: NOW,
    newId,
    frameCheck,
  });

export const apply = (map: HomeMap, ops: readonly HomeMapOp[], actor: HomeMapActor): HomeMap => {
  const applied = applyHomeMapEdits(map, ops, { actor, at: NOW });
  expect(applied.conflicts).toEqual([]);
  return HOME_MAP_WRITE.parse(applied.map);
};

export const importScene = (
  map: HomeMap,
  scene: VacuumScene,
  frameCheck: FrameCheck = keepFrame,
): { readonly plan: ImportPlan; readonly map: HomeMap } => {
  const plan = planFor(map, scene, frameCheck);
  return plan.kind === 'noop' ? { plan, map } : { plan, map: apply(map, plan.ops, plan.actor) };
};

export const edit = (map: HomeMap, ops: readonly HomeMapOp[]): HomeMap => apply(map, ops, USER);

export const floorOf = (map: HomeMap): HomeMapFloor => {
  const floor = map.floors[0];
  if (!floor) throw new Error('no floor');
  return floor;
};

const [HALL, DEN] = syntheticScene.rooms;
if (!HALL || !DEN) throw new Error('fixture rooms');

export const robotRoom = (
  base: VacuumScene['rooms'][number],
  id: number,
  name: string,
  ring: SceneRing,
): VacuumScene['rooms'][number] => ({
  ...base,
  id,
  name,
  label: { x: (ring[0]?.x ?? 0) + 0.5, y: (ring[0]?.y ?? 0) + 0.5 },
  rings: [ring],
});

export const withRooms = (...rooms: VacuumScene['rooms']): VacuumScene => ({
  ...syntheticScene,
  rooms,
});

export const hall = (ring: SceneRing = rectRing(0, 0, 4, 3)): VacuumScene['rooms'][number] =>
  robotRoom(HALL, 1, 'Hall', ring);

export const den = (ring: SceneRing = rectRing(4.1, 0, 8.1, 3)): VacuumScene['rooms'][number] =>
  robotRoom(DEN, 2, 'Den', ring);

export const jitter = (scene: VacuumScene): VacuumScene => ({
  ...scene,
  rooms: scene.rooms.map((room) => ({
    ...room,
    rings: room.rings.map((ring) =>
      ring.map((p, i) => ({
        x: p.x + (i % 2 === 0 ? 0.008 : -0.008),
        y: p.y + (i % 3 === 0 ? 0.006 : -0.006),
      })),
    ),
  })),
  walls: scene.walls.map((wall) => ({
    ...wall,
    from: { x: wall.from.x + 0.005, y: wall.from.y },
    to: { x: wall.to.x, y: wall.to.y - 0.005 },
  })),
  doors: scene.doors.map((door) => ({
    ...door,
    from: { x: door.from.x, y: door.from.y + 0.007 },
    to: { x: door.to.x, y: door.to.y - 0.007 },
  })),
});
