import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulatedClock } from '../../src/clock/simulated';
import { FeedService } from '../../src/planner/feeds';
import { testLogger } from '../support/logs';
import { FeedRig, fixture, START, type FeedServer } from '../support/feed-rig';
import type { TestStore } from '../support/store';
import { FEED_RETRY_SECONDS } from '../../src/planner/subscriptions/subscription';
import {
  FeedExpansionError,
  FeedRedirectError,
  FeedHttpError,
  fetchFeed,
} from '../../src/planner/subscriptions/transport';
import { failureOf } from '../support/feed-rig';

let rig: FeedRig;
let test: TestStore;
let clock: SimulatedClock;
let server: FeedServer;
let service: FeedService;
let ownerId: string;

beforeEach(async () => {
  rig = await FeedRig.start();
  ({ test, clock, server, service, ownerId } = rig);
});

afterEach(async () => {
  await rig.close();
});

describe('fetching a subscription', () => {
  it('reads the feed into the calendar and keeps the validators', async () => {
    server.serve('/family.ics', fixture('google.ics'), {
      etag: '"v1"',
      'last-modified': 'Sat, 14 Nov 2026 10:00:00 GMT',
    });
    const collection = rig.subscribe(ownerId, '/family.ics');
    const row = await service.subscriptions.refresh(collection.id);
    expect(rig.rowsOf(collection)).toEqual(['Christmas', 'Dentist', 'Standup', 'Standup moved']);
    expect(row.feed).toMatchObject({
      kind: 'ics',
      etag: '"v1"',
      last_modified: 'Sat, 14 Nov 2026 10:00:00 GMT',
      fetched_at: START,
      failure: null,
    });
    expect(
      test.store.plannerItems
        .inCollection(collection.id)
        .every((item) => item.created_by === 'feed'),
    ).toBe(true);
  });

  it('asks with the validators and keeps everything when the feed has not changed', async () => {
    server.serve('/family.ics', fixture('google.ics'), { etag: '"v1"' });
    const collection = rig.subscribe(ownerId, '/family.ics');
    await service.subscriptions.refresh(collection.id);
    clock.advanceTo('2026-11-14T13:00:00.000Z');
    const row = await service.subscriptions.refresh(collection.id);
    expect(server.seen.at(-1)?.['if-none-match']).toBe('"v1"');
    expect(row.feed).toMatchObject({ etag: '"v1"', failure: null });
    expect(rig.rowsOf(collection)).toHaveLength(4);
  });

  it('adds, changes and removes by UID when the feed changes', async () => {
    server.serve('/family.ics', fixture('google.ics'));
    const collection = rig.subscribe(ownerId, '/family.ics');
    await service.subscriptions.refresh(collection.id);
    const smaller = fixture('apple.ics');
    server.serve('/family.ics', smaller);
    await service.subscriptions.refresh(collection.id);
    expect(rig.rowsOf(collection)).toEqual([
      'Dinner',
      'Gather documents',
      'Pay invoice',
      'Renew passport',
      'Trip',
    ]);
    const edited = smaller.replace('SUMMARY:Dinner', 'SUMMARY:Late dinner');
    server.serve('/family.ics', edited);
    await service.subscriptions.refresh(collection.id);
    expect(rig.rowsOf(collection)).toContain('Late dinner');
    expect(rig.rowsOf(collection)).not.toContain('Dinner');
    expect(rig.rowsOf(collection)).toHaveLength(5);
  });

  it('reads gzip answers and follows redirects', async () => {
    server.on('/old.ics', () => ({ status: 301, headers: { location: '/new.ics' } }));
    server.on('/new.ics', () => ({
      status: 200,
      headers: { 'content-encoding': 'gzip' },
      body: gzipSync(Buffer.from(fixture('apple.ics'), 'utf8')),
    }));
    const collection = rig.subscribe(ownerId, '/old.ics');
    await service.subscriptions.refresh(collection.id);
    expect(rig.rowsOf(collection)).toHaveLength(5);
  });

  it('refuses a redirect circle and an error answer with what failed', async () => {
    server.on('/a.ics', () => ({ status: 302, headers: { location: '/b.ics' } }));
    server.on('/b.ics', () => ({ status: 302, headers: { location: '/a.ics' } }));
    const url = new URL(server.url('/a.ics'));
    const signal = AbortSignal.timeout(5000);
    await expect(
      fetchFeed({ url, etag: null, lastModified: null, allowPrivate: true, signal }),
    ).rejects.toBeInstanceOf(FeedRedirectError);
    await expect(
      fetchFeed({
        url: new URL(server.url('/missing.ics')),
        etag: null,
        lastModified: null,
        allowPrivate: true,
        signal,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(new FeedHttpError(500).message).toContain('500');
  });

  it('keeps the secret path of a feed address out of its failures', async () => {
    server.on('/private-secret/basic.ics', () => ({ status: 500 }));
    server.on('/loop-secret/a.ics', () => ({
      status: 302,
      headers: { location: '/loop-secret/a.ics' },
    }));
    const signal = AbortSignal.timeout(5000);
    for (const path of ['/private-secret/basic.ics', '/loop-secret/a.ics']) {
      const failure = await fetchFeed({
        url: new URL(server.url(path)),
        etag: null,
        lastModified: null,
        allowPrivate: true,
        signal,
      }).catch((cause: unknown) => String(cause));
      expect(failure).not.toContain('secret');
      expect(failure).not.toContain('127.0.0.1');
    }
  });

  it('refuses a compressed answer that expands implausibly', async () => {
    server.on('/bomb.ics', () => ({
      status: 200,
      headers: { 'content-encoding': 'gzip' },
      body: gzipSync(Buffer.alloc(40 * 1024 * 1024, 'a')),
    }));
    await expect(
      fetchFeed({
        url: new URL(server.url('/bomb.ics')),
        etag: null,
        lastModified: null,
        allowPrivate: true,
        signal: AbortSignal.timeout(10000),
      }),
    ).rejects.toBeInstanceOf(FeedExpansionError);
  });
});

describe('schedule', () => {
  it('uses the subscription refresh time and arms the next fetch from the clock', async () => {
    server.serve('/family.ics', fixture('apple.ics'));
    const collection = rig.subscribe(ownerId, '/family.ics', 90);
    await service.subscriptions.refresh(collection.id);
    expect(clock.pending()).toEqual(['2026-11-14T13:30:00.000Z']);
  });

  it('prefers the feed own refresh interval and then fetches again on time', async () => {
    const text = fixture('apple.ics').replace(
      'PRODID:-//Apple Inc.//macOS 15.1//EN',
      'PRODID:-//Apple Inc.//macOS 15.1//EN\r\nREFRESH-INTERVAL;VALUE=DURATION:PT30M',
    );
    server.serve('/family.ics', text);
    const collection = rig.subscribe(ownerId, '/family.ics', 360);
    await service.subscriptions.refresh(collection.id);
    expect(clock.pending()).toEqual(['2026-11-14T12:30:00.000Z']);
    server.serve('/family.ics', text.replace('SUMMARY:Trip', 'SUMMARY:Long trip'));
    clock.advanceTo('2026-11-14T12:30:00.000Z');
    await vi.waitFor(() => {
      expect(rig.rowsOf(collection)).toContain('Long trip');
    });
    expect(rig.feedOf(collection)).toMatchObject({ fetched_at: '2026-11-14T12:30:00.000Z' });
  });

  it('reads X-PUBLISHED-TTL too', async () => {
    const text = fixture('apple.ics').replace(
      'CALSCALE:GREGORIAN',
      'CALSCALE:GREGORIAN\r\nX-PUBLISHED-TTL:PT2H',
    );
    server.serve('/family.ics', text);
    const collection = rig.subscribe(ownerId, '/family.ics', 360);
    await service.subscriptions.refresh(collection.id);
    expect(clock.pending()).toEqual(['2026-11-14T14:00:00.000Z']);
  });

  it('stores a failure on the calendar, retries with backoff and clears it on recovery', async () => {
    let healthy = false;
    server.on('/flaky.ics', () =>
      healthy ? { status: 200, body: fixture('apple.ics') } : { status: 503, body: 'down' },
    );
    const collection = rig.subscribe(ownerId, '/flaky.ics');
    const failed = await service.subscriptions.refresh(collection.id);
    expect(failed.feed).toMatchObject({ fetched_at: null, failure: { at: START } });
    expect(failureOf(failed)).toContain('503');
    expect(rig.rowsOf(collection)).toEqual([]);
    const retry = new Date(Date.parse(START) + (FEED_RETRY_SECONDS[0] ?? 0) * 1000).toISOString();
    expect(clock.pending()).toEqual([retry]);
    healthy = true;
    clock.advanceTo(retry);
    await vi.waitFor(() => {
      expect(rig.feedOf(collection)).toMatchObject({ failure: null, fetched_at: retry });
    });
    expect(rig.rowsOf(collection)).toHaveLength(5);
  });

  it('arms every subscription when the hub starts and stops them when it stops', async () => {
    server.serve('/family.ics', fixture('apple.ics'));
    const collection = rig.subscribe(ownerId, '/family.ics');
    service.stop();
    clock.advanceTo(START);
    const fresh = new FeedService({ store: test.store, clock, log: testLogger('feeds') });
    fresh.start();
    expect(clock.pending()).toEqual([START]);
    clock.advanceTo(START);
    await vi.waitFor(() => {
      expect(rig.rowsOf(collection)).toHaveLength(5);
    });
    fresh.stop();
    expect(clock.pending()).toEqual([]);
  });

  it('cancels the timer of a calendar that is deleted and refetches when the address changes', async () => {
    server.serve('/one.ics', fixture('apple.ics'));
    server.serve('/two.ics', fixture('google.ics'));
    const collection = rig.subscribe(ownerId, '/one.ics');
    await service.subscriptions.refresh(collection.id);
    expect(clock.pending()).toHaveLength(1);
    const before = rig.feedOf(collection);
    if (before.kind !== 'ics') throw new Error('the collection lost its address');
    test.store.plannerCollections.update(collection.id, ownerId, {
      feed: {
        ...before,
        url: server.url('/two.ics'),
        etag: null,
        last_modified: null,
        fetched_at: null,
      },
    });
    expect(clock.pending()).toEqual([START]);
    clock.advanceTo(START);
    await vi.waitFor(() => {
      expect(rig.rowsOf(collection)).toContain('Standup');
    });
    test.store.plannerCollections.remove(collection.id, ownerId);
    expect(clock.pending()).toEqual([]);
  });
});
