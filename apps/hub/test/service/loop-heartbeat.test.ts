import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';
import { LoopHeartbeat } from '../../src/service/loop-watchdog/loop-heartbeat';
import { BEAT_SEQUENCE, BEAT_SLOTS } from '../../src/service/loop-watchdog/settings';
import { captureLogs, testLogger } from '../support/logs';

const TICK_MS = 2000;

function block(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    continue;
  }
}

function voluntarySwitches(): number {
  const status = readFileSync('/proc/thread-self/status', 'utf8');
  const match = /^voluntary_ctxt_switches:\s+(\d+)$/mu.exec(status);
  if (match?.[1] === undefined) throw new Error('voluntary_ctxt_switches is missing');
  return Number(match[1]);
}

describe('LoopHeartbeat', () => {
  let heartbeat: LoopHeartbeat | null = null;

  afterEach(() => {
    heartbeat?.stop();
    heartbeat = null;
    Logger.reset();
  });

  it('reports a long block that ends before the next beat is due', async () => {
    const logs = captureLogs();
    const beat = new Int32Array(new SharedArrayBuffer(BEAT_SLOTS * 4));
    heartbeat = new LoopHeartbeat(beat, TICK_MS, 'test', testLogger('watchdog'));
    heartbeat.start();
    await delay(100);
    block(1100);
    await delay(TICK_MS);
    const lagged = logs.records.find((record) => record.event === 'loop.lagged');
    expect(Atomics.load(beat, BEAT_SEQUENCE)).toBeGreaterThanOrEqual(1);
    expect(lagged?.payload).toMatchObject({ name: 'test' });
    expect(Number(lagged?.payload['lateMs'])).toBeLessThan(100);
    expect(Number(lagged?.payload['blockedMs'])).toBeGreaterThanOrEqual(1100);
  }, 10_000);

  it('stays asleep between beats while the loop is idle', async () => {
    const logs = captureLogs();
    const beat = new Int32Array(new SharedArrayBuffer(BEAT_SLOTS * 4));
    heartbeat = new LoopHeartbeat(beat, TICK_MS, 'test', testLogger('watchdog'));
    heartbeat.start();
    await delay(50);
    const before = voluntarySwitches();
    await delay(1000);
    const wakeups = voluntarySwitches() - before;
    expect(wakeups).toBeLessThan(20);
    expect(logs.events()).not.toContain('loop.lagged');
  }, 10_000);
});
