import { UNSET_FITNESS_GOALS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { goalsOf } from '../model/goals';
import { moveProgressOf } from './move-progress';

const goals = goalsOf({ ...UNSET_FITNESS_GOALS, move_kcal: 500 });

describe('moveProgressOf', () => {
  it('is null without active energy for the day', () => {
    expect(moveProgressOf([], '2026-11-14', goals)).toBeNull();
    expect(
      moveProgressOf(
        [{ day: '2026-11-13', metric: 'active_energy', value: 300 }],
        '2026-11-14',
        goals,
      ),
    ).toBeNull();
  });

  it('is the share of the move goal reached', () => {
    expect(
      moveProgressOf(
        [{ day: '2026-11-14', metric: 'active_energy', value: 250 }],
        '2026-11-14',
        goals,
      ),
    ).toBe(0.5);
  });

  it('can exceed the goal', () => {
    expect(
      moveProgressOf(
        [{ day: '2026-11-14', metric: 'active_energy', value: 750 }],
        '2026-11-14',
        goals,
      ),
    ).toBe(1.5);
  });
});
