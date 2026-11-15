import { describe, expect, it } from 'vitest';
import { UNSET_FITNESS_GOALS, type ProfileRow } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { addersOf, contributorBadges } from './contributor-badge';

function profile(id: string, name: string): ProfileRow {
  return {
    id,
    name,
    colour: 'aqua',
    sex: null,
    birth_date: null,
    height_cm: null,
    scale_user: null,
    fitness_goals: UNSET_FITNESS_GOALS,
    max_heart_rate: null,
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('contributor badges', () => {
  it('marks each photo with the person who added it and leaves unknown adders bare', () => {
    const ana = profile('ana', 'Ana');
    const ben = profile('ben', 'Ben');
    const adders = addersOf(
      [
        { id: 'i1', addedByProfileId: 'ana' },
        { id: 'i2', addedByProfileId: 'ben' },
        { id: 'i3', addedByProfileId: null },
        { id: 'i4', addedByProfileId: 'gone' },
      ],
      [ana, ben],
    );
    expect([...adders]).toEqual([
      ['i1', ana],
      ['i2', ben],
    ]);
  });

  it('draws a badge only on the photos with a known adder', () => {
    const badgeOf = contributorBadges(new Map([['i1', profile('ana', 'Ana')]]));
    const tile = (id: string): MediaTile => ({
      id,
      rev: 1,
      aspect: 1,
      takenAt: 0,
      offsetMin: 0,
      durationMs: null,
      flags: 0,
      local: false,
    });
    expect(badgeOf(tile('i1'))).not.toBeNull();
    expect(badgeOf(tile('i2'))).toBeNull();
  });
});
