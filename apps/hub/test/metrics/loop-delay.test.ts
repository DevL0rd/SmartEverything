import { describe, expect, it } from 'vitest';
import { openLoopLagWindow } from '../../src/metrics/loop-delay';

const STALL_MS = 150;
const SETTLE_MS = 40;

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

function stall(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const until = performance.now() + STALL_MS;
      while (performance.now() < until) {
        continue;
      }
      resolve();
    }, 0);
  });
}

describe('event loop lag window', () => {
  it('reports a stall inside the window as lag of about the blocked time', async () => {
    const window = openLoopLagWindow();
    await settle();
    await stall();
    await settle();
    const lag = window.finish();
    expect(lag.loopLagMaxMs).toBeGreaterThanOrEqual(STALL_MS - 40);
    expect(lag.loopLagP99Ms).toBeGreaterThanOrEqual(STALL_MS - 40);
  });

  it('does not blame a window for a stall that happened before it opened', async () => {
    await stall();
    const window = openLoopLagWindow();
    await settle();
    expect(window.finish().loopLagMaxMs).toBeLessThan(STALL_MS - 40);
  });

  it('gives overlapping windows only the stalls inside their own span', async () => {
    const first = openLoopLagWindow();
    await settle();
    const firstLag = first.finish();
    const second = openLoopLagWindow();
    await settle();
    await stall();
    await settle();
    const secondLag = second.finish();
    expect(firstLag.loopLagMaxMs).toBeLessThan(STALL_MS - 40);
    expect(secondLag.loopLagMaxMs).toBeGreaterThanOrEqual(STALL_MS - 40);
  });

  it('lets two windows that span the same stall both report it', async () => {
    const first = openLoopLagWindow();
    const second = openLoopLagWindow();
    await settle();
    await stall();
    await settle();
    expect(first.finish().loopLagMaxMs).toBeGreaterThanOrEqual(STALL_MS - 40);
    expect(second.finish().loopLagMaxMs).toBeGreaterThanOrEqual(STALL_MS - 40);
  });

  it('measures nothing after the window is finished or abandoned', async () => {
    const finished = openLoopLagWindow();
    finished.finish();
    const abandoned = openLoopLagWindow();
    abandoned.abandon();
    await stall();
    await settle();
    expect(finished.finish().loopLagMaxMs).toBeLessThan(STALL_MS - 40);
    expect(abandoned.finish()).toEqual({ loopLagMaxMs: 0, loopLagP99Ms: 0 });
  });
});
