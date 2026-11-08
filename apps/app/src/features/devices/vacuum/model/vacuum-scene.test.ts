import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  roomPick,
  vacuumFloor,
  vacuumHit,
  vacuumRenderPose,
  vacuumRoomRenderId,
} from './vacuum-scene';

const scene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(readFileSync(new URL('./scene-geometry.fixture.json', import.meta.url), 'utf8')),
);

const floor = vacuumFloor(scene);

describe('the vacuum 3D scene', () => {
  it('draws one floor with a room for every robot room', () => {
    expect(floor.rooms).toHaveLength(scene.rooms.length);
  });

  it('turns the robot pose from radians into a render pose in degrees', () => {
    const pose = vacuumRenderPose({ x: 1, y: 2, yaw: Math.PI / 2 });
    expect(pose).toMatchObject({ x: 1, y: 2 });
    expect(pose?.yawDeg).toBeCloseTo(90, 9);
    expect(vacuumRenderPose(null)).toBeNull();
  });

  it('pairs robot room ids with their render room ids both ways', () => {
    const renderId = vacuumRoomRenderId(scene, floor, 4);
    expect(renderId).not.toBeNull();
    expect(vacuumHit(scene, floor, roomPick(renderId))).toStrictEqual({ kind: 'room', id: 4 });
    expect(vacuumRoomRenderId(scene, floor, null)).toBeNull();
    expect(vacuumRoomRenderId(scene, floor, 999)).toBeNull();
  });

  it('answers only room picks and nothing for an empty spot, an unknown room or other items', () => {
    expect(vacuumHit(scene, floor, roomPick(null))).toBeNull();
    expect(vacuumHit(scene, floor, { kind: 'room', id: 'missing' })).toBeNull();
    expect(vacuumHit(scene, floor, { kind: 'device', id: 'x' })).toBeNull();
    expect(vacuumHit(scene, floor, { kind: 'wall', id: 'w', offset: 0 })).toBeNull();
  });

  it('makes a room pick from a picked render room id and an empty pick from none', () => {
    expect(roomPick('r1')).toStrictEqual({ kind: 'room', id: 'r1' });
    expect(roomPick(null)).toStrictEqual({ kind: 'none' });
  });
});
