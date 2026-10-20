import { describe, expect, it } from 'vitest';
import {
  BRUSHING_SESSION,
  ORALB_RULES,
  SESSION_DETAILS,
  SESSION_PRESSURE,
  SONICARE_RULES,
  sameSession,
} from '../src';

const BASE = {
  id: 'a',
  deviceId: 'device',
  personId: null,
  handleSessionId: null,
  startedAt: '2026-10-18T07:00:00.000Z',
  zoneOffsetSeconds: 0,
  durationS: 120,
  routineS: 120,
  mode: 'daily_clean',
  intensity: null,
  source: 'observed',
  complete: true,
  pressure: null,
  zones: [30, 30, 30, 30],
  headSerial: null,
} as const;

describe('the details of a session', () => {
  it('reads a session without details as having none', () => {
    expect(BRUSHING_SESSION.parse(BASE).details).toBeNull();
  });

  it('keeps what the handle reported about a session', () => {
    const details = {
      zoneSource: 'pacer',
      face: 7,
      batteryEnd: 88,
      handleUser: 2,
      sectors: 4,
    } as const;
    expect(BRUSHING_SESSION.parse({ ...BASE, details }).details).toStrictEqual(details);
  });

  it('refuses faces, users and sector counts the handle cannot have', () => {
    const ok = { zoneSource: 'pacer', face: 0, batteryEnd: null, handleUser: 0, sectors: 0 };
    expect(SESSION_DETAILS.safeParse(ok).success).toBe(true);
    expect(SESSION_DETAILS.safeParse({ ...ok, face: 12 }).success).toBe(false);
    expect(SESSION_DETAILS.safeParse({ ...ok, handleUser: 8 }).success).toBe(false);
    expect(SESSION_DETAILS.safeParse({ ...ok, sectors: 9 }).success).toBe(false);
    expect(SESSION_DETAILS.safeParse({ ...ok, zoneSource: 'guess' }).success).toBe(false);
  });

  it('accepts the optional force and pressure counts and refuses negatives', () => {
    const plain = { excessS: 1, optimalS: 2, strip: [0, 1, 2] };
    expect(SESSION_PRESSURE.safeParse(plain).success).toBe(true);
    expect(
      SESSION_PRESSURE.parse({
        ...plain,
        lowS: 3,
        highEvents: 2,
        lowEvents: 1,
        forceAvgN: 1.5,
        forceMaxN: 3,
      }),
    ).toMatchObject({ lowS: 3, forceMaxN: 3 });
    expect(SESSION_PRESSURE.safeParse({ ...plain, forceAvgN: -1 }).success).toBe(false);
  });
});

describe('when two records are one session', () => {
  const at = (seconds: number): { startedAt: string } => ({
    startedAt: new Date(Date.parse(BASE.startedAt) + seconds * 1000).toISOString(),
  });

  it('merges within five seconds for a Sonicare and within two minutes for an Oral-B', () => {
    expect(SONICARE_RULES).toStrictEqual({
      mergeWindowS: 5,
      pauseGraceS: 0,
      catchLimitS: 3,
      silenceS: 0,
    });
    expect(ORALB_RULES).toStrictEqual({
      mergeWindowS: 120,
      pauseGraceS: 20,
      catchLimitS: 3,
      silenceS: 30,
    });
    expect(sameSession({ ...BASE, ...at(0), handleSessionId: 1 }, at(5), SONICARE_RULES)).toBe(
      true,
    );
    expect(sameSession({ ...BASE, ...at(0), handleSessionId: 1 }, at(6), SONICARE_RULES)).toBe(
      false,
    );
    expect(sameSession({ ...BASE, ...at(0), handleSessionId: 1 }, at(-100), ORALB_RULES)).toBe(
      true,
    );
    expect(sameSession({ ...BASE, ...at(0), handleSessionId: 1 }, at(121), ORALB_RULES)).toBe(
      false,
    );
  });
});
