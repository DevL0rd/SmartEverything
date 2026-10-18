import { describe, expect, it } from 'vitest';
import { pickPerson, scaleReadingsOf } from './people';
import {
  ALEX,
  DANA,
  SCALE_DEVICE,
  daysAgo,
  profileOf,
  readingOf,
} from '../../../store/body-fixture';

const PROFILES = [profileOf(DANA, 'Dana', 1), profileOf(ALEX, 'Alex', 2)];

describe('who is on this scale', () => {
  it('groups the counted readings of this scale by person and leaves out people without any', () => {
    const { people } = scaleReadingsOf(
      [
        readingOf({ weight_kg: 88, measured_at: daysAgo(2) }),
        readingOf({ weight_kg: 74, measured_at: daysAgo(1), profile_id: ALEX }),
        readingOf({ weight_kg: 60, measured_at: daysAgo(1), device_id: 'another-scale' }),
        readingOf({
          weight_kg: 99,
          measured_at: daysAgo(1),
          attribution: 'ignored',
          profile_id: DANA,
        }),
      ],
      [...PROFILES, profileOf('00000000-0000-4000-8000-0000000000b3', 'Sam', null)],
      SCALE_DEVICE,
    );
    expect(people.map((person) => [person.profile.name, person.weighIns.length])).toEqual([
      ['Dana', 1],
      ['Alex', 1],
    ]);
  });

  it('counts the readings that wait for a person on this scale only', () => {
    const { pending } = scaleReadingsOf(
      [
        readingOf({ weight_kg: 204.7, attribution: 'pending', profile_id: null }),
        readingOf({ weight_kg: 10.1, attribution: 'pending', profile_id: null }),
        readingOf({ weight_kg: 70, attribution: 'pending', profile_id: null, device_id: 'x' }),
      ],
      PROFILES,
      SCALE_DEVICE,
    );
    expect(pending.map((reading) => reading.weight_kg)).toEqual([204.7, 10.1]);
  });

  it('shows the chosen person, else the active one, else whoever stepped on last', () => {
    const { people } = scaleReadingsOf(
      [
        readingOf({ weight_kg: 88, measured_at: daysAgo(3) }),
        readingOf({ weight_kg: 74, measured_at: daysAgo(1), profile_id: ALEX }),
      ],
      PROFILES,
      SCALE_DEVICE,
    );
    const name = (wanted: string | null, active: string | null): string | undefined =>
      pickPerson(people, wanted, active)?.profile.name;
    expect([name(DANA, ALEX), name(null, DANA), name('gone', null)]).toEqual([
      'Dana',
      'Dana',
      'Alex',
    ]);
  });

  it('picks nobody when nobody has weighed in', () => {
    expect(pickPerson([], null, DANA)).toBeNull();
  });
});
