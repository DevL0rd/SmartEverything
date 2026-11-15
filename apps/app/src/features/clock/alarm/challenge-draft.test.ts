import {
  PLANNER_CHALLENGE,
  PLANNER_MATHS_DIFFICULTIES,
  PLANNER_SUNRISE,
  plannerMathsProblemsOf,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  FIRST_MATHS,
  challengeNotesOf,
  challengeOfKind,
  challengeTextOf,
  mathsEdit,
  needsPhone,
  qrChallengeOf,
  sampleProblemOf,
} from './challenge-draft';
import {
  firstSunriseOf,
  missingLightsOf,
  sunriseStartOf,
  sunriseSummaryOf,
  toggledSunriseLight,
} from './sunrise-model';

const LAMP = 'a1b2c3d4-0000-4000-8000-000000000041';
const HALL = 'a1b2c3d4-0000-4000-8000-000000000042';

describe('dismiss challenges', () => {
  it('switches kinds to a challenge the hub contract accepts', () => {
    const none = { kind: 'none' } as const;
    for (const kind of ['none', 'maths', 'steps'] as const) {
      expect(PLANNER_CHALLENGE.safeParse(challengeOfKind(kind, none)).success).toBe(true);
    }
  });

  it('keeps the current settings when the same kind is picked again', () => {
    const maths = { kind: 'maths', difficulty: 'hard', count: 5 } as const;
    expect(challengeOfKind('maths', maths)).toBe(maths);
  });

  it('needs a scanned code before a QR challenge exists', () => {
    expect(challengeOfKind('qr', { kind: 'none' })).toBeNull();
    expect(qrChallengeOf('  ')).toBeNull();
    expect(qrChallengeOf('mirror-7f3a')).toEqual({ kind: 'qr', code: 'mirror-7f3a' });
  });

  it('changes maths settings one at a time', () => {
    expect(mathsEdit(FIRST_MATHS, { count: 4 })).toEqual({ ...FIRST_MATHS, count: 4 });
    expect(mathsEdit(FIRST_MATHS, { difficulty: 'easy' })).toEqual({
      ...FIRST_MATHS,
      difficulty: 'easy',
    });
  });

  it('shows a sample made by the same maths the ring asks', () => {
    for (const difficulty of PLANNER_MATHS_DIFFICULTIES) {
      expect(sampleProblemOf(difficulty)).toBe(
        plannerMathsProblemsOf('sample', difficulty, 1)[0]?.text,
      );
    }
    expect(sampleProblemOf('easy')).toMatch(/^\d \+ \d{2}$/);
    expect(sampleProblemOf('hard')).toMatch(/^\d{1,2} × \d{2} \+ \d{2}$/);
  });

  it('names the challenge on the alarm card', () => {
    expect(challengeTextOf({ kind: 'none' })).toBeNull();
    expect(challengeTextOf({ kind: 'maths', difficulty: 'medium', count: 1 })).toBe(
      '1 medium problem',
    );
    expect(challengeTextOf({ kind: 'steps', steps: 30 })).toBe('30 steps');
  });

  it('asks for a phone only for QR and steps', () => {
    expect(needsPhone({ kind: 'qr', code: 'x' })).toBe(true);
    expect(needsPhone({ kind: 'steps', steps: 10 })).toBe(true);
    expect(needsPhone(FIRST_MATHS)).toBe(false);
    const steps = { kind: 'steps', steps: 10 } as const;
    expect(challengeNotesOf(steps, { phone: false, watch: false })).toHaveLength(2);
    expect(challengeNotesOf(steps, { phone: true, watch: false })).toHaveLength(1);
    expect(challengeNotesOf(FIRST_MATHS, { phone: true, watch: false })).toEqual([]);
  });

  it('says a challenge keeps the alarm off the watch', () => {
    expect(challengeNotesOf(FIRST_MATHS, { phone: true, watch: true })).toHaveLength(1);
    expect(challengeNotesOf({ kind: 'none' }, { phone: false, watch: true })).toEqual([]);
  });
});

describe('sunrise', () => {
  it('starts on the first light of the home', () => {
    const first = firstSunriseOf([
      { id: LAMP, name: 'Lamp' },
      { id: HALL, name: 'Hall' },
    ]);
    expect(PLANNER_SUNRISE.safeParse(first).success).toBe(true);
    expect(first?.lights).toEqual([LAMP]);
    expect(firstSunriseOf([])).toBeNull();
  });

  it('adds and removes lights and turns off with the last one', () => {
    const sunrise = { lights: [LAMP], minutes: 20, colour: true } as const;
    expect(toggledSunriseLight(sunrise, HALL)?.lights).toEqual([LAMP, HALL]);
    expect(toggledSunriseLight(sunrise, LAMP)).toBeNull();
  });

  it('begins the given minutes before the ring, across midnight too', () => {
    expect(sunriseStartOf({ minutes: 30 }, '07:00')).toBe('06:30');
    expect(sunriseStartOf({ minutes: 20 }, '00:10')).toBe('23:50');
    expect(sunriseSummaryOf({ lights: [LAMP, HALL], minutes: 15, colour: false }, '07:00')).toBe(
      '2 lights brighten from 06:45 to full at 07:00.',
    );
  });

  it('lists lights that left the home', () => {
    const sunrise = { lights: [LAMP, HALL], minutes: 20, colour: true } as const;
    expect(missingLightsOf(sunrise, [{ id: LAMP, name: 'Lamp' }])).toEqual([HALL]);
  });
});
