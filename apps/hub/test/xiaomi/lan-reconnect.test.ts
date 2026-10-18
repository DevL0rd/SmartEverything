import { Logger } from '@smarteverything/logging';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanReconnect } from '../../src/adapters/xiaomi/lan-reconnect';

afterEach(() => {
  vi.useRealTimers();
});

describe('LanReconnect', () => {
  it('retries after the first delay, doubles to the longest, and stops once an attempt succeeds', async () => {
    vi.useFakeTimers();
    const attempts: number[] = [];
    let succeed = false;
    const reconnect = new LanReconnect({
      did: '100001',
      timing: { lanRetryFirstMs: 100, lanRetryMaxMs: 350 },
      jitter: (): number => 0.5,
      log: new Logger('tool.xiaomi-test'),
      attempt: (): Promise<boolean> => {
        attempts.push(Date.now());
        return Promise.resolve(succeed);
      },
    });
    const started = Date.now();
    reconnect.arm();
    await vi.advanceTimersByTimeAsync(100 + 200 + 350 + 350);
    expect(attempts.map((at) => at - started)).toEqual([100, 300, 650, 1000]);
    succeed = true;
    await vi.advanceTimersByTimeAsync(350);
    const done = attempts.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(attempts).toHaveLength(done);
  });
});
