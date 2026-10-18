import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  newestEventId,
  SyncthingEventStreams,
} from '../../../src/plugins/builtin/syncthing/event-streams';
import { SyncthingRest } from '../../../src/plugins/builtin/syncthing/rest-client';
import { fakeHttp } from '../fake-http';

afterEach(() => {
  vi.useRealTimers();
});

describe('syncthing event streams', () => {
  it('detects a gap in event ids', () => {
    const at = '2026-10-09T10:00:00Z';
    expect(newestEventId([{ id: 11, type: 'x', time: at, data: null }], 10)).toEqual({
      newest: 11,
      gap: false,
    });
    expect(newestEventId([{ id: 15, type: 'x', time: at, data: null }], 10)).toEqual({
      newest: 15,
      gap: true,
    });
  });

  it('bootstraps, then long-polls from the newest id', async () => {
    const seen: string[] = [];
    let release: () => void = () => undefined;
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fetcher } = fakeHttp({
      'GET /rest/events': (call) =>
        call.query['since'] === '0'
          ? [{ id: 7, type: 'Starting', time: '2026-10-09T10:00:00Z', data: {} }]
          : [],
      'GET /rest/events/disk': [],
    });
    const parkingFetcher: typeof fetcher = (input, init) => {
      const url = new URL(input);
      const timeout = url.searchParams.get('timeout') ?? '';
      if (url.pathname === '/rest/events') {
        seen.push(`${url.searchParams.get('since') ?? ''}/${timeout}`);
      }
      return timeout === '55' ? parked.then(() => fetcher(input, init)) : fetcher(input, init);
    };
    let up = 0;
    const streams = new SyncthingEventStreams(
      new SyncthingRest('http://st', 'key', parkingFetcher),
      {
        onEvents: (): void => undefined,
        onGap: (): void => undefined,
        onUp: (): void => {
          up += 1;
        },
        onDown: (): void => undefined,
      },
    );
    streams.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    streams.stop();
    release();
    expect(seen.slice(0, 2)).toEqual(['0/0', '7/55']);
    expect(up).toBe(1);
  });

  it('retries a down server after one second, then two, then four seconds, and not after stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const attempts: number[] = [];
    const started = Date.now();
    const failing: typeof fetch = () => {
      attempts.push(Date.now() - started);
      return Promise.reject(new Error('down'));
    };
    let down = 0;
    const streams = new SyncthingEventStreams(new SyncthingRest('http://st', 'key', failing), {
      onEvents: (): void => undefined,
      onGap: (): void => undefined,
      onUp: (): void => undefined,
      onDown: (): void => {
        down += 1;
      },
    });
    streams.start();
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    expect(down).toBe(4);
    expect([...new Set(attempts)]).toEqual([0, 1000, 3000, 7000]);
    streams.stop();
    const seen = attempts.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toHaveLength(seen);
  });
});
