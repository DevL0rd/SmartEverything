import type { StateUpdate } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it, vi } from 'vitest';
import {
  REFRESH_CONCURRENCY,
  refreshDevices,
  type RefreshTarget,
} from '../../src/adapters/xiaomi/refresh-devices';

const READ_MS = 1000;

function update(did: string): StateUpdate {
  return {
    externalId: did,
    capability: 'power',
    value: true,
    observedAt: '2026-10-25T00:00:00.000Z',
  };
}

class Probe {
  peak = 0;
  private active = 0;

  enter(): void {
    this.active += 1;
    this.peak = Math.max(this.peak, this.active);
  }

  leave(): void {
    this.active -= 1;
  }
}

function targets(
  count: number,
  failing: ReadonlySet<string>,
  probe: Probe,
): readonly RefreshTarget[] {
  return Array.from({ length: count }, (_, index) => {
    const did = String(index);
    return {
      did,
      readAll: async (): Promise<{ readonly all: readonly StateUpdate[] }> => {
        probe.enter();
        await new Promise((resolve) => setTimeout(resolve, READ_MS));
        probe.leave();
        if (failing.has(did)) {
          throw new Error(`device ${did} did not answer`);
        }
        return { all: [update(did)] };
      },
    };
  });
}

describe('refreshing Xiaomi devices at startup', () => {
  it('reads devices at once within the pool, keeps their order and isolates a failure', async () => {
    vi.useFakeTimers();
    try {
      const probe = new Probe();
      const warn = vi.spyOn(Logger.prototype, 'warn');
      const count = 12;
      const refreshing = refreshDevices(
        targets(count, new Set(['3']), probe),
        new Logger('hub.test'),
      );
      await vi.advanceTimersByTimeAsync(READ_MS * 2);
      const states = await refreshing;
      expect(probe.peak).toBe(REFRESH_CONCURRENCY);
      expect(states.map((state) => state.externalId)).toStrictEqual(
        Array.from({ length: count }, (_, index) => String(index)).filter((did) => did !== '3'),
      );
      expect(warn).toHaveBeenCalledWith(
        'xiaomi_device.refresh_failed',
        expect.objectContaining({ did: '3' }),
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
