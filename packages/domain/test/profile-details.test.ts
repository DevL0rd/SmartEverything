import { describe, expect, it } from 'vitest';
import {
  PROFILE_DETAILS_PUSH_DATA,
  bodyFactsOf,
  fitnessReady,
  missingBodyFacts,
  profileDetailsPush,
} from '../src/profiles';

const COMPLETE = { sex: 'male', birth_date: '1990-10-08', height_cm: 180 } as const;

describe('body facts', () => {
  it('counts whole years, one fewer before the birthday in the same month or earlier month', () => {
    expect(bodyFactsOf(COMPLETE, new Date('2026-10-08T12:00:00Z'))?.age).toBe(36);
    expect(bodyFactsOf(COMPLETE, new Date('2026-10-07T12:00:00Z'))?.age).toBe(35);
    expect(bodyFactsOf(COMPLETE, new Date('2026-09-30T12:00:00Z'))?.age).toBe(35);
    expect(bodyFactsOf(COMPLETE, new Date('2026-11-01T12:00:00Z'))?.age).toBe(36);
  });

  it('gives the sex and height with the age', () => {
    expect(bodyFactsOf(COMPLETE, new Date('2026-10-08T12:00:00Z'))).toStrictEqual({
      sex: 'male',
      age: 36,
      heightCm: 180,
    });
  });

  it.each([
    { ...COMPLETE, sex: null },
    { ...COMPLETE, birth_date: null },
    { ...COMPLETE, height_cm: null },
  ])('has no facts and is not ready when %j', (profile) => {
    expect(bodyFactsOf(profile, new Date('2026-10-08T12:00:00Z'))).toBeNull();
    expect(missingBodyFacts(profile)).toBe(true);
    expect(fitnessReady(profile)).toBe(false);
  });

  it('is ready when nothing is missing', () => {
    expect(missingBodyFacts(COMPLETE)).toBe(false);
    expect(fitnessReady(COMPLETE)).toBe(true);
  });
});

describe('profileDetailsPush', () => {
  const id = '3a000000-0000-4000-8000-0000000000a1';

  it('speaks to the owner as you and to others by name', () => {
    expect(profileDetailsPush({ id, name: 'Me' }).body).toBe(
      'Add your height, birthday and sex to get body fat, muscle and more.',
    );
    expect(profileDetailsPush({ id, name: 'Sam' }).body).toBe(
      'Add Sam’s height, birthday and sex to get body fat, muscle and more.',
    );
  });

  it('carries data the app can route on', () => {
    const { data } = profileDetailsPush({ id, name: 'Sam' });
    expect(PROFILE_DETAILS_PUSH_DATA.parse(data)).toStrictEqual({
      kind: 'profile_details',
      profileId: id,
    });
  });
});
