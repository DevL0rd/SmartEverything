import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../../src/clock/simulated';
import { DryRun } from '../../../src/automations/sim/dry-run';
import type { DryRunRequest } from '../../../src/automations/sim/dry-run';
import {
  NOW,
  furnish,
  pause,
  programOf,
  send,
  seq,
  setDevice,
  signal,
  untilSignal,
} from './support';
import type { Home } from './support';

let home: Home;
let clock: SimulatedClock;
let resumers: ((resume: WaitResume) => void)[];

beforeEach(async () => {
  home = await furnish();
  clock = new SimulatedClock(NOW);
  resumers = [];
});

afterEach(async () => {
  await home.test.close();
});

function dry(request: Pick<DryRunRequest, 'start'> & Partial<DryRunRequest>): DryRun {
  return new DryRun({
    live: {
      clock,
      base: home.deps,
      watch: (_wait, resume) => {
        resumers.push(resume);
        return () => undefined;
      },
    },
    ...request,
  });
}

describe('DryRun', () => {
  it('records the would-be commands and finishes without touching the home', async () => {
    const set = setDevice('set', home.lampA.id, true);
    const run = dry({ start: programOf(seq(set.op, send('after').op)) });
    const report = await run.finished();
    expect(report.run).toMatchObject({ status: 'succeeded', error: null });
    expect(report.commands.map((command) => command.kind)).toEqual(['device.set', 'test.effect']);
    expect(
      home.read('device.get', { device: { device: home.lampA.id } }).outputs['value'],
    ).toBeNull();
  });

  it('follows scripted outcomes for a target', async () => {
    const set = setDevice('set', home.lampA.id, true);
    const run = dry({
      start: programOf(seq(set.op)),
      overrides: { effects: [{ device: home.lampA.id, outcome: { kind: 'offline' } }] },
    });
    const report = await run.finished();
    expect(report.run.status).toBe('failed');
    expect(report.commands[0]?.outcome).toBe('offline');
  });

  it('wakes from the live subscriptions it is given', async () => {
    const run = dry({
      start: programOf(seq(untilSignal('presence', 'sensor', 'occupancy'), send('after').op)),
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(resumers).toHaveLength(1);
    resumers[0]?.({
      kind: 'signal',
      signal: {
        ...signal('sensor', 'occupancy', true),
        at: new Date(clock.latest() + 1000).toISOString(),
      },
    });
    const report = await run.finished();
    expect(report.run.status).toBe('succeeded');
    expect(report.commands).toHaveLength(1);
  });

  it('can be cancelled while parked on a wait', async () => {
    const run = dry({ start: programOf(seq(pause('hold', 3_600_000), send('after').op)) });
    await new Promise((resolve) => setImmediate(resolve));
    expect(run.cancel()).toBe(true);
    const report = await run.finished();
    expect(report.run.status).toBe('cancelled');
    expect(report.commands).toHaveLength(0);
  });

  it('pauses at a breakpoint of the start request and continues on request', async () => {
    const first = send('first');
    const second = send('second');
    const run = dry({
      start: programOf(seq(first.op, second.op)),
      breakpoints: [second.id],
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(run.paused.map((hit) => hit.nodeId)).toEqual([second.id]);
    expect(run.commands).toHaveLength(1);
    expect(run.proceed('continue')).toBe(true);
    const report = await run.finished();
    expect(report.commands).toHaveLength(2);
    expect(report.paused).toHaveLength(0);
  });
});
