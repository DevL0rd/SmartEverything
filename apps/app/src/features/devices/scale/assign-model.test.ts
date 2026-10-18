import { describe, expect, it } from 'vitest';
import { GUEST_LABEL, choicesOf, queueStep, targetOfPending, targetsFor } from './assign-model';
import { ALEX, DANA, daysAgo, profileOf, readingOf } from '../../../store/body-fixture';
import { weighInsOf } from './weigh-ins';

const PROFILES = [profileOf(DANA, 'Dana', 1), profileOf(ALEX, 'Alex', 2)];

describe('who was this choices', () => {
  it('lists every person, marks the owner of the reading and ends with the guest', () => {
    const target = { id: 'r', kg: 88, iso: daysAgo(1), owner: ALEX };
    expect(choicesOf(target, PROFILES, DANA)).toEqual([
      { profileId: DANA, label: 'Me (Dana)', selected: false },
      { profileId: ALEX, label: 'Alex', selected: true },
      { profileId: null, label: GUEST_LABEL, selected: false },
    ]);
  });

  it('marks nobody for a reading that waits for a person', () => {
    const waiting = targetOfPending(
      readingOf({ weight_kg: 204.7, attribution: 'pending', profile_id: null }),
    );
    expect(choicesOf(waiting, PROFILES, null).some((choice) => choice.selected)).toBe(false);
  });

  it('goes through a queue one reading at a time and counts from one', () => {
    const queue = ['a', 'b'].map((id) => ({ id, kg: 1, iso: daysAgo(1), owner: null }));
    expect(queueStep(queue, new Set(), 2)).toMatchObject({ position: 1, total: 2 });
    const second = queueStep(queue, new Set(['a']), 2);
    expect([second.current?.id, second.position]).toEqual(['b', 2]);
    expect(queueStep(queue, new Set(['a', 'b']), 2).current).toBeNull();
  });
});

describe('what the sheet opens on', () => {
  const weighIns = weighInsOf([readingOf({ weight_kg: 87.9, measured_at: daysAgo(1) })]);
  const latest = weighIns.at(-1) ?? null;
  const pending = [readingOf({ weight_kg: 204.7, attribution: 'pending', profile_id: null })];

  it('opens Not me on the latest weigh-in of the shown person', () => {
    const [target] = targetsFor('one', latest, DANA, pending);
    expect(target).toMatchObject({ kg: 87.9, owner: DANA });
  });

  it('opens the queue on every waiting reading', () => {
    expect(targetsFor('queue', latest, DANA, pending).map((target) => target.kg)).toEqual([204.7]);
  });

  it('opens on nothing when nobody has weighed in', () => {
    expect(targetsFor('one', null, null, pending)).toEqual([]);
  });
});
