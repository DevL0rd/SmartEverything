import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionHeartbeat } from '../../src/network/connection-heartbeat';

afterEach(() => {
  vi.useRealTimers();
});

async function elapse(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function fakeIntervals(): void {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
}

describe('connection heartbeat', () => {
  it('sets no timer until a connection starts it', async () => {
    fakeIntervals();
    const beat = vi.fn(() => true);
    const heartbeat = new ConnectionHeartbeat(1000, beat);
    expect(vi.getTimerCount()).toBe(0);
    await elapse(10_000);
    expect(beat).not.toHaveBeenCalled();
    expect(heartbeat.running).toBe(false);
  });

  it('beats while connections remain and stops itself after the beat that finds none', async () => {
    fakeIntervals();
    let connections = 2;
    const beat = vi.fn(() => connections > 0);
    const heartbeat = new ConnectionHeartbeat(1000, beat);
    heartbeat.start();
    heartbeat.start();
    await elapse(3000);
    expect(beat).toHaveBeenCalledTimes(3);
    connections = 0;
    await elapse(1000);
    expect(beat).toHaveBeenCalledTimes(4);
    expect(heartbeat.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await elapse(10_000);
    expect(beat).toHaveBeenCalledTimes(4);
    connections = 1;
    heartbeat.start();
    await elapse(1000);
    expect(beat).toHaveBeenCalledTimes(5);
    heartbeat.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
