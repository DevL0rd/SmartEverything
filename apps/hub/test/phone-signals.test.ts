import {
  PHONE_ACTION,
  PHONE_EVENT,
  ROW_CHANGE,
  SIGNAL_SOURCES,
  kindSpecOf,
  type RowChange,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { feedContextOf } from '../src/signals/sources/feed-context';
import { healthSignals } from '../src/signals/sources/health';

const PROFILE = '2d000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-11T07:30:00.000Z');
const ENDED = '2026-10-11T07:10:00.000Z';

function sleepChange(value: number, previous: number | null): RowChange {
  const row = (amount: number): Record<string, unknown> => ({
    profile_id: PROFILE,
    day: '2026-10-11',
    metric: 'sleep',
    value: amount,
    unit: 'min',
    updated_at: NOW.toISOString(),
  });
  return ROW_CHANGE.parse({
    type: 'change',
    table: 'health_daily',
    operation: previous === null ? 'INSERT' : 'UPDATE',
    record: row(value),
    oldRecord: previous === null ? null : row(previous),
  });
}

function sleepSignals(change: RowChange, end: string | null): ReturnType<typeof healthSignals> {
  return healthSignals(
    change,
    feedContextOf(
      NOW,
      () => 'UTC',
      () => end,
    ),
  ).filter((signal) => signal.kind === 'sleep_ended');
}

describe('sleep ended signal', () => {
  it('fires once with the end time when today sleep grows and a night just ended', () => {
    const signals = sleepSignals(sleepChange(420, null), ENDED);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: 'health',
      kind: 'sleep_ended',
      subject: PROFILE,
      value: ENDED,
      data: { endedAt: ENDED, minutes: 420 },
    });
  });

  it('stays quiet when a resync leaves the total unchanged', () => {
    expect(sleepSignals(sleepChange(420, 420), ENDED)).toEqual([]);
  });

  it('stays quiet when no sleep ended recently', () => {
    expect(sleepSignals(sleepChange(420, null), null)).toEqual([]);
  });

  it('is registered so automations and list_signal_kinds can name it', () => {
    expect(kindSpecOf(SIGNAL_SOURCES, { source: 'health', kind: 'sleep_ended' })).toMatchObject({
      pulse: true,
      subject: 'profile',
    });
  });
});

describe('phone unlocked and flashlight', () => {
  it('reads an unlock event from a phone report and registers it as an event signal', () => {
    expect(PHONE_EVENT.safeParse({ kind: 'phone_unlocked', at: ENDED, details: {} }).success).toBe(
      true,
    );
    expect(kindSpecOf(SIGNAL_SOURCES, { source: 'event', kind: 'phone_unlocked' })).toMatchObject({
      pulse: true,
      match: [],
    });
  });

  it('accepts flashlight modes and refuses others', () => {
    expect(PHONE_ACTION.safeParse({ type: 'flashlight', mode: 'toggle' }).success).toBe(true);
    expect(PHONE_ACTION.safeParse({ type: 'flashlight', mode: 'blink' }).success).toBe(false);
  });
});
