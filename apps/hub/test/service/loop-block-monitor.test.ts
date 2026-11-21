import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';
import { startLoopBlockMonitor, type LoopBlockMonitor } from '../../src/service/loop-block-monitor';
import { captureLogs, testLogger } from '../support/logs';

const WINDOW_MS = 300;

function block(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    continue;
  }
}

describe('the event-loop block monitor', () => {
  let monitor: LoopBlockMonitor | null = null;

  afterEach(() => {
    monitor?.stop();
    monitor = null;
    Logger.reset();
  });

  it('warns with the p99 and the longest block when the loop is held past the limit', async () => {
    const logs = captureLogs();
    monitor = startLoopBlockMonitor({ log: testLogger('loop'), windowMs: WINDOW_MS });
    await delay(50);
    block(120);
    await delay(WINDOW_MS * 2);
    const blocked = logs.records.find((record) => record.event === 'loop.blocked');
    expect(blocked?.level).toBe('warn');
    expect(Number(blocked?.payload['maxMs'])).toBeGreaterThanOrEqual(100);
    expect(Number(blocked?.payload['p99Ms'])).toBeGreaterThanOrEqual(0);
    expect(blocked?.payload['thresholdMs']).toBe(50);
  });

  it('stays quiet while the loop is free', async () => {
    const logs = captureLogs();
    monitor = startLoopBlockMonitor({ log: testLogger('loop'), windowMs: WINDOW_MS });
    await delay(WINDOW_MS * 3);
    block(20);
    await delay(WINDOW_MS);
    expect(logs.events()).not.toContain('loop.blocked');
  });
});
