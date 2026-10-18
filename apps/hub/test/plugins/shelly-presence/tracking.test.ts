import type { JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { OperationPorts } from '../../../src/plugins/builtin/shelly-presence/ports';
import { appHolder, ShellyTracking } from '../../../src/plugins/builtin/shelly-presence/tracking';

const DURATION_S = 300;

interface Device {
  readonly log: string[];
  readonly call: OperationPorts['call'];
  broken: boolean;
}

function device(): Device {
  const log: string[] = [];
  const state: Device = {
    log,
    broken: false,
    call: <T>(method: string, params: JsonValue, schema: z.ZodType<T>): Promise<T> => {
      log.push(`${method} ${JSON.stringify(params)}`);
      if (state.broken) return Promise.reject(new Error('offline'));
      const reply =
        method === 'Presence.GetStatus'
          ? {
              live_track: {
                timer_started_at: Date.now() / 1000,
                timer_duration: DURATION_S,
                interval: 1,
              },
            }
          : {};
      return Promise.resolve(schema.parse(reply));
    },
  };
  return state;
}

const starts = (fake: Device): number =>
  fake.log.filter((line) => line === 'Presence.LiveTrack {"enable":true}').length;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Shelly tracking holders', () => {
  it('starts once for the first holder and stops after the last one lets go', async () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    await tracking.hold('phone');
    await tracking.hold('automation');
    expect(starts(fake)).toBe(1);
    expect(await tracking.release('phone')).toEqual({ enabled: true });
    expect(fake.log).not.toContain('Presence.LiveTrack {"enable":false}');
    expect(await tracking.release('automation')).toEqual({ enabled: false });
    expect(fake.log.at(-1)).toBe('Presence.LiveTrack {"enable":false}');
    tracking.suspend();
  });

  it('keeps tracking for an hour without anyone renewing and only renews the device timer', async () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    await tracking.hold('phone');
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(starts(fake)).toBeGreaterThan(10);
    expect(fake.log).not.toContain('Presence.LiveTrack {"enable":false}');
    tracking.suspend();
    const seen = fake.log.length;
    await vi.advanceTimersByTimeAsync(DURATION_S * 1000);
    expect(fake.log.length).toBe(seen);
  });

  it('does not count a holder whose start failed', async () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    fake.broken = true;
    await expect(tracking.hold('phone')).rejects.toThrow('offline');
    fake.broken = false;
    await tracking.hold('phone');
    expect(starts(fake)).toBe(2);
    tracking.suspend();
  });

  it('keeps its holders while suspended and starts again on resume', async () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    await tracking.hold('phone');
    tracking.suspend();
    await vi.advanceTimersByTimeAsync(DURATION_S * 1000);
    expect(starts(fake)).toBe(1);
    tracking.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(starts(fake)).toBe(2);
    expect(await tracking.release('phone')).toEqual({ enabled: false });
    tracking.suspend();
  });

  it('starts a holder remembered while offline when the sensor comes back', async () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    expect(tracking.remember('viewers')).toEqual({ enabled: true });
    expect(fake.log).toEqual([]);
    tracking.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(starts(fake)).toBe(1);
    tracking.suspend();
  });

  it('does not touch the sensor when a holder that was never counted lets go', async () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    expect(await tracking.release('viewers')).toEqual({ enabled: false });
    expect(tracking.remember('a')).toEqual({ enabled: true });
    expect(tracking.forget('b')).toEqual({ enabled: true });
    expect(tracking.forget('a')).toEqual({ enabled: false });
    expect(fake.log).toEqual([]);
  });

  it('lets go of every holder of a departed app and keeps the others', async () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    await tracking.hold(appHolder('phone', 'person-1', undefined));
    await tracking.hold(appHolder('phone', 'person-1', 'porch'));
    await tracking.hold(appHolder('phone-2', 'person-1', undefined));
    expect(await tracking.releaseClient('phone')).toEqual({ enabled: true });
    expect(fake.log).not.toContain('Presence.LiveTrack {"enable":false}');
    expect(await tracking.releaseClient('phone-2')).toEqual({ enabled: false });
    expect(fake.log.at(-1)).toBe('Presence.LiveTrack {"enable":false}');
    tracking.suspend();
  });

  it('drops the holders of a departed app while offline without touching the sensor', () => {
    const fake = device();
    const tracking = new ShellyTracking(fake.call, vi.fn());
    tracking.remember(appHolder('phone', 'person-1', undefined));
    tracking.remember('automation:::person-1:');
    expect(tracking.forgetClient('phone')).toEqual({ enabled: true });
    expect(fake.log).toEqual([]);
  });
});
