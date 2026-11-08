import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { vacuumRenderScene } from '../adapters/vacuum-scene';
import type { RenderFloor } from '../render-scene';
import { describePlan } from './rooms';

const scrubbed: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../features/devices/vacuum/model/scene-geometry.fixture.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

function floorOf(scene: VacuumScene): RenderFloor {
  const [floor] = vacuumRenderScene({ scene }).floors;
  if (floor === undefined) throw new Error('no floor');
  return floor;
}

const plain = floorOf(scrubbed);

const restricted: VacuumScene['zones'] = [
  {
    id: 1,
    kind: 'no_go',
    points: [
      { x: 10.2, y: -8.4 },
      { x: 11.2, y: -8.4 },
      { x: 11.2, y: -7.4 },
      { x: 10.2, y: -7.4 },
    ],
  },
  {
    id: 2,
    kind: 'no_mop',
    points: [
      { x: 12, y: -8.4 },
      { x: 13, y: -8.4 },
      { x: 13, y: -7.4 },
      { x: 12, y: -7.4 },
    ],
  },
  {
    id: 3,
    kind: 'wall',
    points: [
      { x: 13.5, y: -8.6 },
      { x: 13.5, y: -6 },
    ],
  },
  {
    id: 4,
    kind: 'hidden',
    points: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
  },
];

describe('describePlan', () => {
  it('builds the screen reader summary', () => {
    expect(describePlan(plain, 'Home', '3', 'docked')).toBe(
      'Map of Home, 5 rooms, robot in Fixture room 3, docked',
    );
  });

  it('copes with no rooms, no robot, one room and restricted areas', () => {
    expect(describePlan({ rooms: [], vacuum: null }, null, null, null)).toBe(
      'Map of Home, no rooms',
    );
    const one = floorOf({ ...scrubbed, rooms: scrubbed.rooms.slice(0, 1), zones: restricted });
    expect(describePlan(one, 'Flat', null, 'cleaning')).toBe(
      'Map of Flat, 1 room, 2 restricted areas, robot on the map, cleaning',
    );
  });
});
