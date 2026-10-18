import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IceServer } from '@smarteverything/domain';
import { ApiClient } from '../../../api/connection/client';

const started = vi.hoisted(() => ({ calls: 0 }));

vi.mock('./session-start', () => ({
  guarded: (hooks: unknown): unknown => hooks,
  logFailure: (): void => undefined,
  startDirect: (): void => {
    started.calls += 1;
  },
  startRelay: (): void => {
    started.calls += 1;
  },
}));
vi.mock('./video-surface', () => ({ surfaceReportsFrames: (): boolean => true }));
vi.mock('./rtc', () => ({ relaySupported: (): boolean => false }));

const { acquireSession, releaseSession } = await import('./session-registry');

function client(baseUrl: string): ApiClient {
  return new ApiClient({
    baseUrl,
    token: null,
    fetch: (): Promise<Response> => Promise.reject(new Error('offline')),
    onUnauthorized: (): void => undefined,
  });
}

const NO_ICE: readonly IceServer[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  started.calls = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shared camera sessions', () => {
  it('shares one session per camera and connection, even across client objects', () => {
    const first = acquireSession({
      deviceId: 'a',
      client: client('https://hub'),
      iceServers: NO_ICE,
      quality: 'full' as const,
    });
    const second = acquireSession({
      deviceId: 'a',
      client: client('https://hub'),
      iceServers: NO_ICE,
      quality: 'full' as const,
    });
    expect(second).toBe(first);
    expect(started.calls).toBe(1);
    const other = acquireSession({
      deviceId: 'b',
      client: client('https://hub'),
      iceServers: NO_ICE,
      quality: 'full' as const,
    });
    expect(other).not.toBe(first);
    releaseSession(first);
    releaseSession(second);
    releaseSession(other);
    vi.advanceTimersByTime(10_000);
  });

  it('keeps a released session through the grace period and starts a new one after it', () => {
    const key = {
      deviceId: 'c',
      client: client('https://hub'),
      iceServers: NO_ICE,
      quality: 'full' as const,
    };
    const first = acquireSession(key);
    releaseSession(first);
    vi.advanceTimersByTime(5_000);
    expect(acquireSession(key)).toBe(first);
    expect(started.calls).toBe(1);
    releaseSession(first);
    vi.advanceTimersByTime(10_000);
    const fresh = acquireSession(key);
    expect(fresh).not.toBe(first);
    expect(started.calls).toBe(2);
    releaseSession(fresh);
    vi.advanceTimersByTime(10_000);
  });

  it('keeps the tile stream and the full stream of one camera apart', () => {
    const hub = client('https://hub');
    const base = { deviceId: 'c', client: hub, iceServers: NO_ICE };
    const full = acquireSession({ ...base, quality: 'full' });
    const tile = acquireSession({ ...base, quality: 'tile' });
    expect(tile).not.toBe(full);
    expect(acquireSession({ ...base, quality: 'tile' })).toBe(tile);
    releaseSession(full);
    releaseSession(tile);
    releaseSession(tile);
    vi.advanceTimersByTime(10_000);
  });

  it('restarts the stream when the ICE servers change', () => {
    const hub = client('https://hub');
    const first = acquireSession({
      deviceId: 'd',
      client: hub,
      iceServers: NO_ICE,
      quality: 'full' as const,
    });
    releaseSession(first);
    const changed = [{ urls: ['stun:example.test'] }];
    const again = acquireSession({
      deviceId: 'd',
      client: hub,
      iceServers: changed,
      quality: 'full' as const,
    });
    expect(again).toBe(first);
    expect(started.calls).toBe(2);
    expect(again.key.iceServers).toBe(changed);
    releaseSession(again);
    vi.advanceTimersByTime(10_000);
  });
});
