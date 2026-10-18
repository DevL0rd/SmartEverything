import { beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { DOOR, RUN_PHASE, STATUS, UNLOAD, WASHER_ID, resting, runCycle } from './bench';

function pendingOf(bench: ReturnType<typeof resting>): unknown {
  return bench.values.get(`${WASHER_ID}|${UNLOAD}`);
}

describe('washer unload pending', () => {
  beforeEach(() => {
    captureLogs();
  });

  it('is not set before any cycle has finished', () => {
    const bench = resting();
    bench.set(DOOR, 'Open');
    expect(bench.pushed).toEqual([]);
  });

  it('is set when a cycle finishes and cleared by the first door opening', () => {
    const bench = resting();
    runCycle(bench);
    expect(pendingOf(bench)).toBeUndefined();
    bench.set(STATUS, 'Completed');
    expect(pendingOf(bench)).toBe(true);
    bench.advance(30);
    bench.set(DOOR, 'Closed And Can Be Opened');
    expect(pendingOf(bench)).toBe(true);
    bench.set(DOOR, 'Open');
    expect(pendingOf(bench)).toBe(false);
  });

  it('stays clear when the door is opened and closed again after unloading', () => {
    const bench = resting();
    runCycle(bench);
    bench.set(STATUS, 'Completed');
    bench.set(DOOR, 'Open');
    bench.set(DOOR, 'Closed And Can Be Opened');
    bench.set(DOOR, 'Open');
    expect(bench.pushed.map((update) => update.value)).toEqual([true, false]);
  });

  it('is set for a stopped cycle too, because the wet clothes are still inside', () => {
    const bench = resting();
    runCycle(bench);
    bench.set(STATUS, 'Paused');
    bench.set(STATUS, 'Idle');
    expect(pendingOf(bench)).toBe(true);
  });

  it('is cleared when a new cycle starts without the door being seen opening', () => {
    const bench = resting();
    runCycle(bench);
    bench.set(STATUS, 'Completed');
    bench.advance(5);
    bench.set(STATUS, 'Idle');
    runCycle(bench);
    expect(pendingOf(bench)).toBe(false);
  });

  it('is not repeated when the machine reports the end twice', () => {
    const bench = resting();
    runCycle(bench);
    bench.set(RUN_PHASE, 'Washing Completed');
    bench.set(STATUS, 'Completed');
    bench.set(STATUS, 'Idle');
    bench.set(STATUS, 'Completed');
    expect(bench.pushed.filter((update) => update.value === true)).toHaveLength(1);
  });

  it('is stamped with the time the cycle finished', () => {
    const bench = resting();
    runCycle(bench);
    bench.advance(10);
    bench.set(STATUS, 'Completed');
    expect(bench.pushed[0]).toMatchObject({
      capability: UNLOAD,
      value: true,
      observedAt: new Date(bench.now).toISOString(),
    });
  });
});
