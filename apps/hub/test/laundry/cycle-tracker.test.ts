import { beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import {
  Bench,
  LIGHT,
  LIGHT_ID,
  WASHER,
  WASHER_ID,
  STATUS,
  PROGRAM,
  FAULT,
  REMAINING,
  RUN_PHASE,
  FILTER,
  DETERGENT,
  SOFTENER,
  deviceOf,
  reported,
  resting,
  runCycle,
  START,
} from './bench';

describe('laundry cycle tracker', () => {
  beforeEach(() => {
    captureLogs();
  });

  it('records one start and one finish for Off, Idle, Busy phases, Completed', () => {
    const bench = new Bench();
    bench.seed(WASHER_ID, STATUS, 'Off');
    bench.seed(WASHER_ID, PROGRAM, 'ECO4060');
    bench.seed(WASHER_ID, REMAINING, 0);
    bench.set(STATUS, 'Idle');
    expect(bench.kinds()).toEqual([]);
    runCycle(bench);
    bench.advance(10);
    bench.set(STATUS, 'Completed');
    expect(bench.kinds()).toEqual(['activity', 'cycle_finished']);
    expect(bench.stored[0]?.event.details).toMatchObject({
      family: 'laundry',
      laundry: 'started',
      program: 'Eco 40-60',
      plannedMinutes: 190,
    });
    expect(bench.last().details).toMatchObject({
      family: 'laundry',
      outcome: 'completed',
      minutes: 110,
      energy: null,
      water: null,
      dried: false,
    });
    expect(bench.stored[1]?.occurrence).toBe(
      `laundry:${WASHER_ID}:${new Date(START).toISOString()}:end`,
    );
  });

  it('ends a paused, then idle cycle as stopped', () => {
    const bench = resting();
    runCycle(bench);
    bench.set(STATUS, 'Paused');
    bench.advance(2);
    bench.set(STATUS, 'Idle');
    expect(bench.kinds()).toEqual(['activity', 'cycle_finished']);
    expect(bench.last().details).toMatchObject({ outcome: 'stopped', minutes: 102 });
  });

  it('starts a delayed cycle when the wash begins, not when the delay is scheduled', () => {
    const bench = resting();
    bench.set(STATUS, 'Delay');
    expect(bench.kinds()).toEqual([]);
    bench.advance(6 * 60);
    bench.set(REMAINING, 90);
    bench.set(STATUS, 'Busy');
    bench.advance(90);
    bench.set(STATUS, 'Completed');
    expect(bench.kinds()).toEqual(['activity', 'cycle_finished']);
    expect(bench.stored[0]?.event.details).toMatchObject({ plannedMinutes: 90 });
    expect(bench.last().details).toMatchObject({ outcome: 'completed', minutes: 90 });
  });

  it('records nothing when a delay is cancelled', () => {
    const bench = resting();
    bench.set(STATUS, 'Delay');
    bench.advance(30);
    bench.set(STATUS, 'Idle');
    bench.set(STATUS, 'Delay');
    bench.set(STATUS, 'Off');
    expect(bench.kinds()).toEqual([]);
  });

  it('treats a stop with the wash already finished as completed and keeps one finish', () => {
    const bench = resting();
    runCycle(bench);
    bench.set(RUN_PHASE, 'Washing Completed');
    bench.set(STATUS, 'Idle');
    bench.tracker.claim(deviceOf(WASHER), reported('wash-end', bench.now, { source: 'lan-push' }));
    expect(bench.kinds()).toEqual(['activity', 'cycle_finished']);
    expect(bench.last().details).toMatchObject({ outcome: 'completed' });
  });

  it('does not repeat a finish when the hub restarts between wash-end and Completed', () => {
    const bench = resting();
    runCycle(bench);
    bench.tracker.claim(deviceOf(WASHER), reported('wash-end', bench.now, { source: 'lan-push' }));
    bench.restart();
    bench.advance(1);
    bench.set(STATUS, 'Completed');
    expect(bench.kinds()).toEqual(['activity', 'cycle_finished']);
  });

  it('drops the start and minutes when the stored start is a day or more old', () => {
    const bench = resting();
    runCycle(bench);
    bench.advance(3 * 24 * 60);
    bench.set(STATUS, 'Completed');
    expect(bench.last().details).toMatchObject({ startedAt: null, minutes: null });
  });

  it('notifies a low consumable once until it has been good for hours', () => {
    const bench = resting();
    bench.set(DETERGENT, 'Low');
    bench.set(DETERGENT, 'Normal');
    bench.advance(60);
    bench.set(DETERGENT, 'Low');
    expect(bench.kinds()).toEqual(['maintenance']);
    bench.set(DETERGENT, 'Normal');
    bench.advance(7 * 60);
    bench.set(DETERGENT, 'Low');
    expect(bench.kinds()).toEqual(['maintenance', 'maintenance']);
  });

  it('follows a device whose model changed after the first notice', () => {
    const bench = resting();
    bench.set(DETERGENT, 'Low');
    bench.devices = [
      {
        ...WASHER,
        model: 'yeelink.light.lamp1',
        kind: 'light',
        updated_at: '2026-10-02T00:00:00.000Z',
      },
      LIGHT,
    ];
    bench.set(DETERGENT, 'Normal');
    bench.set(DETERGENT, 'Low');
    expect(bench.kinds()).toEqual(['maintenance']);
  });

  it('records a fault when the code leaves No Faults and nothing when it clears', () => {
    const bench = resting();
    bench.set(FAULT, 'Water Draining Malfunction');
    bench.set(FAULT, 'No Faults');
    expect(bench.kinds()).toEqual(['fault']);
    expect(bench.last().details).toMatchObject({
      family: 'laundry',
      raw: 'Water Draining Malfunction',
      code: 3,
    });
  });

  it('records low detergent, low softener and a dirty filter once each when they turn bad', () => {
    const bench = resting();
    bench.set(DETERGENT, 'Low');
    bench.set(DETERGENT, 'Normal');
    bench.set(SOFTENER, 'Low');
    bench.set(FILTER, true);
    bench.set(FILTER, false);
    expect(bench.stored.map((entry) => entry.event.details['item'])).toEqual([
      'detergent',
      'softener',
      'filter',
    ]);
    expect(bench.kinds()).toEqual(['maintenance', 'maintenance', 'maintenance']);
  });

  it('makes the machine-reported wash-end and the Completed status one finish in either order', () => {
    const before = resting();
    runCycle(before);
    const washEnd = reported('wash-end', before.now, { source: 'lan-push' });
    expect(before.tracker.claim(deviceOf(WASHER), washEnd)).toBe(true);
    before.set(STATUS, 'Completed');
    expect(before.kinds()).toEqual(['activity', 'cycle_finished']);

    const after = resting();
    runCycle(after);
    after.set(STATUS, 'Completed');
    after.tracker.claim(deviceOf(WASHER), washEnd);
    expect(after.kinds()).toEqual(['activity', 'cycle_finished']);
  });

  it('merges the wash log into the finished event', () => {
    const bench = resting();
    runCycle(bench);
    bench.set(STATUS, 'Completed');
    const log = reported('wash-end-log', bench.now, { source: 'lan-push', 'load-value': 4 });
    bench.tracker.claim(deviceOf(WASHER), log);
    expect(bench.kinds()).toEqual(['activity', 'cycle_finished']);
    expect(bench.last().details).toMatchObject({ outcome: 'completed', 'load-value': 4 });
  });

  it('does not duplicate the start or invent a finish when the hub restarts mid-cycle', () => {
    const bench = resting();
    runCycle(bench);
    bench.restart();
    bench.advance(20);
    bench.set(RUN_PHASE, 'Drying');
    expect(bench.kinds()).toEqual(['activity']);
    bench.set(STATUS, 'Completed');
    expect(bench.kinds()).toEqual(['activity', 'cycle_finished']);
    expect(bench.last().details).toMatchObject({
      minutes: 120,
      startedAt: new Date(START).toISOString(),
    });
  });

  it('finishes with unknown minutes when the start happened while the hub was down', () => {
    const bench = new Bench();
    bench.seed(WASHER_ID, STATUS, 'Busy');
    bench.seed(WASHER_ID, PROGRAM, 'Cotton');
    bench.set(STATUS, 'Completed');
    expect(bench.kinds()).toEqual(['cycle_finished']);
    expect(bench.last().details).toMatchObject({
      program: 'Cotton',
      startedAt: null,
      minutes: null,
    });
  });

  it('ignores changes to or from an unknown value', () => {
    const bench = resting();
    bench.set(STATUS, null);
    bench.set(STATUS, 'Busy');
    expect(bench.kinds()).toEqual([]);
    bench.set(STATUS, null);
    expect(bench.kinds()).toEqual([]);
    const fresh = new Bench();
    fresh.set(STATUS, 'Busy');
    fresh.set(FAULT, 'Door Lock Malfunction');
    expect(fresh.kinds()).toEqual([]);
  });

  it('ignores devices that are not washers', () => {
    const bench = resting();
    bench.set('power', true, LIGHT_ID);
    bench.set('power', false, LIGHT_ID);
    expect(bench.kinds()).toEqual([]);
  });

  it('logs an unrecognised status and records nothing', () => {
    const logs = captureLogs();
    const bench = resting();
    bench.set(STATUS, 'Exploding');
    expect(bench.kinds()).toEqual([]);
    expect(logs.events()).toContain('laundry.change_failed');
  });
});
