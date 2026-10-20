import { describe, expect, it } from 'vitest';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { SLICE_STEPS } from '../../../src/automations/driver/scheduler';
import { Harness, runIdOf, condition, effect, guard, occurrence, pause, seq } from './support';

function deferred(): { promise: Promise<NodeResult>; settle: (result: NodeResult) => void } {
  let settle: (result: NodeResult) => void = () => undefined;
  const promise = new Promise<NodeResult>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe('LiveRun through the driver', () => {
  it('runs a plain body to success and records the finished live run once', async () => {
    const h = new Harness();
    const result = h.driver.submit(occurrence({ body: seq(effect('a'), effect('b')) }));
    await h.settle();
    expect(result.kind).toBe('started');
    expect(h.requests.map((request) => request.node.key)).toEqual(['a', 'b']);
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]?.ending.status).toBe('succeeded');
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]).toMatchObject({
      name: 'Test automation',
      outcome: 'succeeded',
      error: null,
    });
    expect(h.driver.active).toBe(0);
  });

  it('fails the run with the effect error and reports the message', async () => {
    const h = new Harness();
    h.perform = (): Promise<NodeResult> =>
      Promise.resolve({ ok: false, class: 'Refused', message: 'the lamp said no' });
    h.driver.submit(occurrence({ body: seq(effect('a')) }));
    await h.settle();
    expect(h.recorded[0]).toMatchObject({ outcome: 'failed' });
    expect(h.recorded[0]?.error).toContain('the lamp said no');
  });

  it('turns a rejecting effect port into a failed run instead of losing it', async () => {
    const h = new Harness();
    h.perform = (): Promise<NodeResult> => Promise.reject(new Error('adapter exploded'));
    h.driver.submit(occurrence({ body: seq(effect('a')) }));
    await h.settle();
    expect(h.recorded[0]?.outcome).toBe('failed');
    expect(h.driver.active).toBe(0);
  });

  it('splits a long run into slices of 256 steps and yields between them', () => {
    const h = new Harness();
    const body = seq(...Array.from({ length: 700 }, (_, index) => guard(`g${String(index)}`)));
    h.driver.submit(occurrence({ body }));
    expect(h.yields).toHaveLength(1);
    let slices = 0;
    for (let round = 0; round < 50 && h.finished.length === 0; round += 1) {
      const batch = h.yields.splice(0);
      slices += batch.length;
      for (const resume of batch) resume();
    }
    expect(h.finished).toHaveLength(1);
    expect(slices).toBeGreaterThanOrEqual(Math.ceil(700 / SLICE_STEPS));
  });

  it('parks on a duration through the clock and wakes at the due time', async () => {
    const h = new Harness();
    h.driver.submit(occurrence({ body: seq(pause('p', 60_000), effect('after')) }));
    await h.settle();
    expect(h.parked).toHaveLength(1);
    expect(h.clock.pending()).toHaveLength(1);
    expect(h.requests).toHaveLength(0);
    await h.advance(59_999);
    expect(h.requests).toHaveLength(0);
    await h.advance(1);
    expect(h.requests.map((request) => request.node.key)).toEqual(['after']);
    expect(h.finished).toHaveLength(1);
    expect(h.clock.pending()).toHaveLength(0);
  });

  it('idle runs hold no scheduler work while every run is parked', async () => {
    const h = new Harness();
    h.driver.submit(occurrence({ body: seq(pause('p', 60_000)), policy: { mode: 'parallel' } }));
    h.driver.submit(occurrence({ body: seq(pause('p', 90_000)), policy: { mode: 'parallel' } }));
    await h.settle();
    expect(h.yields).toHaveLength(0);
    expect(h.driver.active).toBe(2);
  });

  it('resumes a watched wait from the port and cancels the watch afterwards', async () => {
    const h = new Harness();
    h.driver.submit(occurrence({ body: seq(condition('c'), effect('after')) }));
    await h.settle();
    expect(h.watched).toHaveLength(1);
    h.watched[0]?.resume({ kind: 'timeout' });
    await h.settle();
    expect(h.requests.map((request) => request.node.key)).toEqual(['after']);
    expect(h.watched[0]?.cancelled).toBe(true);
    expect(h.clock.pending()).toHaveLength(0);
  });

  it('ignores a stale watch signal after the run moved on', async () => {
    const h = new Harness();
    h.driver.submit(occurrence({ body: seq(condition('c'), effect('after')) }));
    await h.settle();
    const watch = h.watched[0];
    watch?.resume({ kind: 'timeout' });
    watch?.resume({ kind: 'timeout' });
    await h.settle();
    expect(h.requests).toHaveLength(1);
  });

  it('cancels a parked run at once and removes its timer', async () => {
    const h = new Harness();
    const runId = runIdOf(
      h.driver.submit(occurrence({ body: seq(pause('p', 60_000), effect('after')) })),
    );
    await h.settle();
    expect(h.driver.cancel(runId, 'user_stop')).toBe(true);
    await h.settle();
    expect(h.finished[0]?.ending).toMatchObject({ status: 'cancelled', reason: 'user_stop' });
    expect(h.requests).toHaveLength(0);
    expect(h.clock.pending()).toHaveLength(0);
    expect(h.recorded[0]?.outcome).toBe('cancelled');
  });

  it('stops waiting for an effect on cancel and hands its late result to afterCancel', async () => {
    const h = new Harness();
    const slow = deferred();
    h.perform = (): Promise<NodeResult> => slow.promise;
    const submission = h.driver.submit(occurrence({ body: seq(effect('slow'), effect('never')) }));
    await h.settle();
    expect(submission.kind).toBe('started');
    if (submission.kind === 'refused') return;
    h.driver.cancel(submission.runId, 'user_stop');
    await h.settle();
    expect(h.finished[0]?.ending.status).toBe('cancelled');
    slow.settle({ ok: true, value: {} });
    await h.settle();
    expect(h.afterCancel.map((request) => request.node.key)).toEqual(['slow']);
    expect(h.requests.map((request) => request.node.key)).toEqual(['slow']);
  });

  it('reports a cancel on a finished run as not applied', async () => {
    const h = new Harness();
    const submission = h.driver.submit(occurrence({ body: seq(effect('a')) }));
    await h.settle();
    expect(submission.kind === 'started' && h.driver.cancel(submission.runId, 'user_stop')).toBe(
      false,
    );
  });

  it('records dry and simulated runs in the sink but never through recordRun', async () => {
    const h = new Harness();
    const dry = occurrence({ body: seq(effect('a')), kind: 'dry' }).start(
      '00000000-0000-4000-8000-0000000000a1',
    );
    const simulated = occurrence({ body: seq(effect('a')), kind: 'simulated' }).start(
      '00000000-0000-4000-8000-0000000000a2',
    );
    h.driver.run(dry);
    h.driver.run(simulated);
    await h.settle();
    expect(h.finished.map((entry) => entry.kind).sort()).toEqual(['dry', 'simulated']);
    expect(h.recorded).toHaveLength(0);
  });

  it('adopts a parked run after a restart and lets it finish', async () => {
    const h = new Harness();
    const first = new Harness();
    first.driver.submit(occurrence({ body: seq(pause('p', 60_000), effect('after')) }));
    await first.settle();
    const parked = first.parked[0];
    expect(parked).toBeDefined();
    if (parked === undefined) return;
    const start = occurrence({ body: seq(pause('p', 60_000), effect('after')) }).start(
      parked.runId,
    );
    h.driver.adopt({ ...start, state: { ...parked } });
    await h.settle();
    expect(h.started).toHaveLength(0);
    await h.advance(120_000);
    expect(h.requests.map((request) => request.node.key)).toEqual(['after']);
    expect(h.recorded).toHaveLength(1);
  });

  it('refuses to adopt a run that was not parked', () => {
    const h = new Harness();
    expect(() => {
      h.driver.adopt(
        occurrence({ body: seq(effect('a')) }).start('00000000-0000-4000-8000-0000000000b1'),
      );
    }).toThrow(TypeError);
  });

  it('cancels every run on shutdown with the shutdown reason and refuses new submissions', async () => {
    const h = new Harness();
    h.driver.submit(occurrence({ body: seq(pause('p', 60_000)), policy: { mode: 'parallel' } }));
    h.driver.submit(occurrence({ body: seq(pause('p', 60_000)), policy: { mode: 'parallel' } }));
    await h.settle();
    h.driver.shutdown();
    await h.settle();
    expect(h.finished.map((entry) => entry.ending.reason)).toEqual(['shutdown', 'shutdown']);
    expect(() => h.driver.submit(occurrence({ body: seq(effect('a')) }))).toThrow(/stopping/);
  });
});
