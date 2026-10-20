import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IceServer } from '@smarteverything/domain';
import { ApiClient } from '../../../api/connection/client';
import type { MediaLink } from './peer-types';
import type { SessionHooks } from './session-start';

const started = vi.hoisted(() => {
  const hooks: SessionHooks[] = [];
  return { hooks };
});

vi.mock('./session-start', () => ({
  guarded: (hooks: unknown): unknown => hooks,
  logFailure: (): void => undefined,
  startDirect: (_target: unknown, hooks: SessionHooks): void => {
    started.hooks.push(hooks);
  },
}));
vi.mock('./video-surface', () => ({ surfaceReportsFrames: (): boolean => true }));
vi.mock('./relay', () => ({ relayStarter: (): null => null }));

const { SessionLease, startPausesOf } = await import('./session-lease');

const NO_ICE: readonly IceServer[] = [];

function key(deviceId: string): {
  readonly deviceId: string;
  readonly client: ApiClient;
  readonly iceServers: readonly IceServer[];
  readonly quality: 'full';
} {
  return {
    deviceId,
    client: new ApiClient({
      baseUrl: 'https://hub',
      token: null,
      fetch: (): Promise<Response> => Promise.reject(new Error('offline')),
      onUnauthorized: (): void => undefined,
    }),
    iceServers: NO_ICE,
    quality: 'full',
  };
}

function link(): { readonly link: MediaLink; readonly listening: boolean[] } {
  const listening: boolean[] = [];
  return {
    listening,
    link: {
      onMedia: (): void => undefined,
      onState: (): void => undefined,
      onVideoFlow: (): void => undefined,
      setListening: (on): void => {
        listening.push(on);
      },
      setTalking: (): Promise<void> => Promise.resolve(),
      stats: (): Promise<unknown> => Promise.resolve(null),
      close: (): void => undefined,
    },
  };
}

function attach(): ReturnType<typeof link> {
  const attached = link();
  started.hooks.at(-1)?.onLink(attached.link, 'webrtc');
  return attached;
}

beforeEach(() => {
  vi.useFakeTimers();
  started.hooks.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what a camera lease starts paused for', () => {
  it('waits for focus on a screen and for the foreground when the app is in the background', () => {
    expect(startPausesOf({ waitForFocus: false, backgrounded: false })).toEqual([]);
    expect(startPausesOf({ waitForFocus: true, backgrounded: false })).toEqual(['focus']);
    expect(startPausesOf({ waitForFocus: true, backgrounded: true })).toEqual(['focus', 'app']);
  });
});

describe('a camera lease', () => {
  it('opens no stream while the app is in the background and opens it when the app returns', () => {
    const lease = new SessionLease(['app']);
    lease.want(key('lease-a'), true);
    expect(started.hooks).toHaveLength(0);
    expect(lease.current.get().suspended).toBe(true);
    lease.resume('app');
    expect(started.hooks).toHaveLength(1);
    expect(lease.current.get().suspended).toBe(false);
    lease.letGo();
    vi.advanceTimersByTime(10_000);
  });

  it('stays paused until every reason to pause has gone', () => {
    const lease = new SessionLease(['focus', 'app']);
    lease.want(key('lease-b'), true);
    lease.resume('focus');
    expect(started.hooks).toHaveLength(0);
    lease.resume('app');
    expect(started.hooks).toHaveLength(1);
    lease.suspend('focus');
    lease.suspend('app');
    lease.resume('app');
    expect(lease.current.get().suspended).toBe(true);
    lease.letGo();
    vi.advanceTimersByTime(10_000);
  });

  it('plays sound only while a player listens and is not paused', () => {
    const lease = new SessionLease([]);
    lease.want(key('lease-c'), true);
    const attached = attach();
    lease.listen(true);
    expect(attached.listening.at(-1)).toBe(true);
    lease.suspend('app');
    expect(attached.listening.at(-1)).toBe(false);
    lease.listen(true);
    expect(attached.listening.at(-1)).toBe(false);
    lease.resume('app');
    expect(attached.listening.at(-1)).toBe(true);
    lease.letGo();
    vi.advanceTimersByTime(10_000);
  });

  it('silences the stream the moment the player lets go of it', () => {
    const lease = new SessionLease([]);
    lease.want(key('lease-d'), true);
    const attached = attach();
    lease.listen(true);
    lease.letGo();
    expect(attached.listening.at(-1)).toBe(false);
    vi.advanceTimersByTime(10_000);
  });

  it('tells its listeners once when it first pauses, however many reasons follow', () => {
    const lease = new SessionLease([]);
    const paused = vi.fn();
    lease.onSuspend(paused);
    lease.suspend('focus');
    lease.suspend('app');
    expect(paused).toHaveBeenCalledTimes(1);
  });
});
