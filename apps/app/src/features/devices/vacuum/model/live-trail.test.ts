import type { VacuumTrailRun } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  rebaseLiveTrail,
  shownTrailOf,
  startLiveTrail,
  withLivePose,
  type LivePosePoint,
  type LiveTrail,
} from './live-trail';

const SCENE_TRAIL: readonly VacuumTrailRun[] = [
  {
    mopping: false,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  },
  {
    mopping: true,
    points: [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  },
];

function pose(cursor: number, x: number, y: number): LivePosePoint {
  return { x, y, cursor };
}

function fed(trail: LiveTrail, poses: readonly (LivePosePoint | null)[]): LiveTrail {
  return poses.reduce<LiveTrail>((held, next) => withLivePose(held, next), trail);
}

describe('live trail', () => {
  it('grows from the end of the scene trail with every new pose and keeps the mop run', () => {
    const trail = fed(startLiveTrail(SCENE_TRAIL, pose(10, 1, 1)), [
      pose(12, 1.5, 1),
      pose(14, 2, 1),
    ]);
    const shown = shownTrailOf(trail);
    expect(shown.base).toBe(SCENE_TRAIL);
    expect(shown.live).toStrictEqual([
      {
        mopping: true,
        points: [
          { x: 1, y: 1 },
          { x: 1.5, y: 1 },
          { x: 2, y: 1 },
        ],
      },
    ]);
  });

  it('ignores a repeated cursor and a point the scene already holds', () => {
    const start = startLiveTrail(SCENE_TRAIL, pose(10, 1, 1));
    expect(withLivePose(start, pose(10, 1, 1))).toBe(start);
    const grown = fed(start, [pose(12, 1.5, 1), pose(12, 1.5, 1), pose(13, 1.5, 1)]);
    expect(grown.points).toStrictEqual([pose(12, 1.5, 1)]);
  });

  it('drops live points the next scene already carries', () => {
    const grown = fed(startLiveTrail(SCENE_TRAIL, pose(10, 1, 1)), [pose(12, 1.5, 1)]);
    const next: readonly VacuumTrailRun[] = [
      ...SCENE_TRAIL,
      {
        mopping: true,
        points: [
          { x: 1, y: 1 },
          { x: 1.5, y: 1 },
          { x: 2, y: 1 },
        ],
      },
    ];
    const rebased = rebaseLiveTrail(grown, next);
    expect(shownTrailOf(rebased)).toStrictEqual({ base: next, live: [] });
    expect(rebaseLiveTrail(rebased, next)).toBe(rebased);
    const late = withLivePose(rebased, pose(13, 2, 1));
    expect(late.points).toStrictEqual([]);
    expect(late.anchor).toBe(13);
    expect(withLivePose(late, pose(15, 2.5, 1)).points).toStrictEqual([pose(15, 2.5, 1)]);
  });

  it('starts over when the cursor goes back or the hub clears the route for a new clean', () => {
    const grown = fed(startLiveTrail(SCENE_TRAIL, pose(10, 1, 1)), [pose(12, 1.5, 1)]);
    const restarted = withLivePose(grown, pose(2, 5, 5));
    expect(shownTrailOf(restarted)).toStrictEqual({ base: [], live: [] });
    const next = withLivePose(restarted, pose(4, 5.5, 5));
    expect(shownTrailOf(next).live).toStrictEqual([
      {
        mopping: false,
        points: [
          { x: 5, y: 5 },
          { x: 5.5, y: 5 },
        ],
      },
    ]);
    const emptied = withLivePose(grown, null);
    expect(shownTrailOf(emptied)).toStrictEqual({ base: [], live: [] });
    expect(withLivePose(emptied, null)).toBe(emptied);
    expect(shownTrailOf(rebaseLiveTrail(emptied, SCENE_TRAIL.slice(0, 1))).base).toHaveLength(1);
  });

  it('keeps the scene trail when no live pose was ever seen', () => {
    const start = startLiveTrail(SCENE_TRAIL, null);
    expect(withLivePose(start, null)).toBe(start);
    expect(shownTrailOf(start)).toStrictEqual({ base: SCENE_TRAIL, live: [] });
    const first = withLivePose(start, pose(3, 2, 2));
    expect(shownTrailOf(first).live[0]?.points).toStrictEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });
});
