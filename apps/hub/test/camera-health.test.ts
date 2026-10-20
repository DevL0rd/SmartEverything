import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CameraFirewallDownError,
  CameraHealth,
  PROBE_FIRST_DELAY_MS,
  PROBE_LONGEST_DELAY_MS,
  probeDelayMs,
  type CameraDown,
  type CameraFault,
} from '../src/cameras/camera-health';
import { CameraOfflineError } from '../src/cameras/camera-service';
import { captureLogs, testLogger } from './support/logs';

const CAMERA = '2a000000-0000-4000-8000-000000000001';
const FIRST = PROBE_FIRST_DELAY_MS;
const MINUTE = 60_000;

interface Rig {
  readonly health: CameraHealth;
  readonly probes: () => number;
  readonly events: (readonly [string, CameraDown | null])[];
  readonly reach: { fault: CameraFault; healthy: boolean };
}

function rig(): Rig {
  captureLogs();
  const reach: Rig['reach'] = { fault: 'camera', healthy: false };
  let probes = 0;
  const health = new CameraHealth({
    faultOf: (): CameraFault => reach.fault,
    load: (): Record<string, number> => ({}),
    probe: (): Promise<void> => {
      probes += 1;
      return reach.healthy ? Promise.resolve() : Promise.reject(new Error('no picture'));
    },
    now: (): Date => new Date(),
    log: testLogger('cameras'),
  });
  const events: (readonly [string, CameraDown | null])[] = [];
  health.onChange((deviceId, down) => {
    events.push([deviceId, down]);
  });
  return { health, probes: () => probes, events, reach };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-18T12:00:00.000Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('probeDelayMs', () => {
  it('starts at the first delay, doubles with every missed probe and stops at the longest', () => {
    expect([0, 1, 2, 3, 4, 9].map(probeDelayMs)).toStrictEqual([
      FIRST,
      2 * FIRST,
      4 * FIRST,
      PROBE_LONGEST_DELAY_MS,
      PROBE_LONGEST_DELAY_MS,
      PROBE_LONGEST_DELAY_MS,
    ]);
  });
});

describe('CameraHealth', () => {
  it('knows nothing against a camera until a timeout is confirmed', () => {
    const { health } = rig();
    expect(health.refusal(CAMERA)).toBeNull();
  });

  it('marks a camera down on the first confirmed timeout and announces it once', () => {
    const { health, events } = rig();
    health.failed(CAMERA);
    health.failed(CAMERA);
    health.failed(CAMERA);
    expect(events).toStrictEqual([
      [CAMERA, { fault: 'camera', since: '2026-10-18T12:00:00.000Z', probes: 0 }],
    ]);
    expect(health.refusal(CAMERA)).toBeInstanceOf(CameraOfflineError);
    health.stop();
  });

  it('blames the firewall when the computer is blocking the camera', () => {
    const { health, reach } = rig();
    reach.fault = 'firewall';
    health.failed(CAMERA);
    expect(health.refusal(CAMERA)).toBeInstanceOf(CameraFirewallDownError);
    expect(health.refusal(CAMERA)).toBeInstanceOf(CameraOfflineError);
    health.stop();
  });

  it('probes after the first delay, then backs off to the longest while the camera stays silent', async () => {
    const { health, probes } = rig();
    health.failed(CAMERA);
    await vi.advanceTimersByTimeAsync(FIRST - 1);
    expect(probes()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(probes()).toBe(1);
    await vi.advanceTimersByTimeAsync(2 * FIRST);
    expect(probes()).toBe(2);
    await vi.advanceTimersByTimeAsync(4 * FIRST);
    expect(probes()).toBe(3);
    await vi.advanceTimersByTimeAsync(PROBE_LONGEST_DELAY_MS * 2);
    expect(probes()).toBe(5);
    expect(health.refusal(CAMERA)).not.toBeNull();
    health.stop();
  });

  it('recovers when a probe sees the camera, announces it once and stops probing', async () => {
    const { health, probes, events, reach } = rig();
    health.failed(CAMERA);
    await vi.advanceTimersByTimeAsync(FIRST);
    reach.healthy = true;
    await vi.advanceTimersByTimeAsync(2 * FIRST);
    expect(health.refusal(CAMERA)).toBeNull();
    expect(events.map(([, down]) => down?.fault ?? null)).toStrictEqual(['camera', null]);
    const seen = probes();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(probes()).toBe(seen);
  });

  it('tracks each camera on its own', async () => {
    const { health, probes } = rig();
    health.failed(CAMERA);
    health.failed('other');
    await vi.advanceTimersByTimeAsync(FIRST);
    expect(probes()).toBe(2);
    health.recovered('other');
    expect(health.refusal(CAMERA)).not.toBeNull();
    expect(health.refusal('other')).toBeNull();
    health.stop();
  });

  it('stops probing and forgets everything when the hub stops', async () => {
    const { health, probes, events } = rig();
    health.failed(CAMERA);
    health.stop();
    health.failed(CAMERA);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(probes()).toBe(0);
    expect(events).toHaveLength(1);
    expect(health.refusal(CAMERA)).toBeNull();
  });
});
