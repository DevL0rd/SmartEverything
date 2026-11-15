import { PLANNER_RING_ROW, type PlannerRingRow, type PlannerSleep } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { phoneRingKeyOf, refKeyOf, ringIdOf, ringRefOf } from './ring-keys';
import { sleepLineOf, soundLineOf } from './ring-lines';

const ALARM = 'a1b2c3d4-0000-4000-8000-000000000003';
const OTHER = 'a1b2c3d4-0000-4000-8000-000000000009';
const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const RING = 'a1b2c3d4-0000-4000-8000-000000000002';
const LATER = 'a1b2c3d4-0000-4000-8000-000000000004';

function ring(id: string, refId: string, due: string): PlannerRingRow {
  return PLANNER_RING_ROW.parse({
    id,
    kind: 'alarm',
    ref_id: refId,
    profile_id: PROFILE,
    due_at: due,
    rang_at: due,
    dismissed_at: null,
    snoozes: 0,
    target: null,
    outcome: 'rang',
    missed_reason: null,
  });
}

function sleep(average: number | null): PlannerSleep {
  return {
    nights: [
      {
        date: '2026-11-14',
        bed_at: '2026-11-13T22:30:00.000Z',
        woke_at: '2026-11-14T06:00:00.000Z',
        asleep_minutes: 430,
      },
    ],
    week_average_minutes: average,
  };
}

describe('ring keys', () => {
  it('reads a phone ring key and leaves a hub ring id alone', () => {
    expect(ringRefOf(`alarm:${ALARM}`)).toEqual({ kind: 'key', ring: 'alarm', refId: ALARM });
    expect(ringRefOf(`timer:${ALARM}`)).toEqual({ kind: 'key', ring: 'timer', refId: ALARM });
    expect(ringRefOf(RING)).toEqual({ kind: 'id', ringId: RING });
    expect(ringRefOf('reminder:x')).toEqual({ kind: 'id', ringId: 'reminder:x' });
  });

  it('names the phone key of alarms and timers only', () => {
    expect(phoneRingKeyOf('alarm', ALARM)).toBe(`alarm:${ALARM}`);
    expect(phoneRingKeyOf('reminder', ALARM)).toBeNull();
    expect(refKeyOf(ringRefOf(`timer:${ALARM}`))).toBe(`timer:${ALARM}`);
    expect(refKeyOf(ringRefOf(RING))).toBeNull();
  });

  it('finds the newest hub ring of the alarm a phone key names', () => {
    const ref = ringRefOf(`alarm:${ALARM}`);
    const rows = [
      ring(RING, ALARM, '2026-11-14T06:00:00.000Z'),
      ring(LATER, ALARM, '2026-11-14T06:09:00.000Z'),
      ring(OTHER, OTHER, '2026-11-14T07:00:00.000Z'),
    ];
    expect(ringIdOf(ref, null, rows)).toBe(LATER);
    expect(ringIdOf(ref, null, undefined)).toBeUndefined();
    expect(ringIdOf(ref, null, [])).toBeNull();
    const notice = {
      type: 'planner_ring',
      ringId: OTHER,
      kind: 'alarm',
      refId: ALARM,
      dueAt: '2026-11-14T06:00:00.000Z',
    } as const;
    expect(ringIdOf(ref, notice, rows)).toBe(OTHER);
    expect(ringIdOf(ringRefOf(RING), null, undefined)).toBe(RING);
  });
});

describe('sleep line', () => {
  it('compares last night with the week average', () => {
    expect(sleepLineOf(sleep(410), '2026-11-14')).toBe(
      'Slept 7 h 10 min, 20 min more than your week average.',
    );
    expect(sleepLineOf(sleep(500), '2026-11-14')).toBe(
      'Slept 7 h 10 min, 1 h 10 min less than your week average.',
    );
    expect(sleepLineOf(sleep(430), '2026-11-14')).toBe(
      'Slept 7 h 10 min, right on your week average.',
    );
    expect(sleepLineOf(sleep(null), '2026-11-14')).toBe('Slept 7 h 10 min.');
  });

  it('shows nothing without a night for today', () => {
    expect(sleepLineOf(undefined, '2026-11-14')).toBeNull();
    expect(sleepLineOf(sleep(410), '2026-11-15')).toBeNull();
  });
});

describe('sound line', () => {
  const radio = {
    kind: 'radio',
    station_id: 's1',
    name: 'Jazz FM',
    url: 'https://radio.example/jazz',
  } as const;

  it('names the chosen music when no phone is playing it', () => {
    expect(soundLineOf(null, { kind: 'tone', id: 'dawn' })).toBeNull();
    expect(soundLineOf(null, radio)?.text).toBe('Radio · Jazz FM');
    expect(soundLineOf(null, { kind: 'file', item_id: ALARM })?.text).toBe('Your song from Drive');
    expect(soundLineOf(null, { kind: 'playlist', item_id: ALARM, shuffle: true })?.text).toBe(
      'Your playlist from Drive, shuffled',
    );
  });

  it('names what the phone plays and says why the tone took over', () => {
    const playing = { ringing: true, nowPlaying: 'Jazz FM', safetyNet: null };
    expect(soundLineOf(playing, radio)).toEqual({
      icon: 'radio',
      text: 'Playing Jazz FM',
      fellBack: false,
    });
    const fell = {
      ringing: true,
      nowPlaying: 'the alarm tone',
      safetyNet: 'the station did not start in 10 seconds',
    };
    expect(soundLineOf(fell, radio)).toEqual({
      icon: 'warning',
      text: 'Playing the alarm tone because the station did not start in 10 seconds.',
      fellBack: true,
    });
    const tone = { ringing: true, nowPlaying: 'the alarm tone', safetyNet: null };
    expect(soundLineOf(tone, { kind: 'tone', id: 'dawn' })).toBeNull();
  });
});
