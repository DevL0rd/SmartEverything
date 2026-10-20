import { describe, expect, it } from 'vitest';
import { oralbSessionOf } from '../../toothbrush/model/fixtures';
import { NOT_RECORDED, recapViewOf, routineWord } from './recap-model';

describe('the recap of a session', () => {
  it('shows the final state of the arch from the real seconds', () => {
    const view = recapViewOf(oralbSessionOf({ zones: [30, 30, 18, 0], durationS: 78 }));
    expect(view.quarters?.map((quarter) => quarter.state)).toEqual([
      'done',
      'done',
      'partial',
      'missed',
    ]);
    expect(view.big).toBe('1:18');
    expect(view.small).toBe('2 of 4 quarters');
  });

  it('names the face the handle showed, without claiming a meaning', () => {
    expect(recapViewOf(oralbSessionOf()).faceLine).toBe('The handle showed face 5 of 11');
  });

  it('shows no face line when the handle showed none', () => {
    const none = oralbSessionOf({
      details: { zoneSource: 'pacer', face: null, batteryEnd: null, handleUser: null, sectors: 4 },
    });
    expect(recapViewOf(none).faceLine).toBeNull();
    expect(recapViewOf(none).face).toBeNull();
  });

  it('keeps the arch neutral and says so for a record without quarters', () => {
    for (const session of [
      oralbSessionOf({ zones: [] }),
      oralbSessionOf({
        details: { zoneSource: 'pacer', face: 3, batteryEnd: null, handleUser: null, sectors: 0 },
      }),
    ]) {
      const view = recapViewOf(session);
      expect(view.quarters).toBeNull();
      expect(view.caption).toBe(NOT_RECORDED);
    }
  });

  it('tells a stopped session from a completed one', () => {
    expect(routineWord({ complete: true, durationS: 124, routineS: 120 })).toBe('Routine complete');
    expect(routineWord({ complete: false, durationS: 72, routineS: 120 })).toBe(
      'Stopped at 1:12 of 2:00',
    );
  });
});
