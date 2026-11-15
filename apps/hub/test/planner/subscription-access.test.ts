import { FeedKindUnavailableError, FeedRegistry } from '../../src/planner/feeds/registry';
import { feedUrlOf } from '../../src/planner/subscriptions/address';
import { fetchFeed } from '../../src/planner/subscriptions/transport';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FeedService } from '../../src/planner/feeds';
import { FeedRig, fixture, START, type FeedServer } from '../support/feed-rig';
import type { TestStore } from '../support/store';
import { failureOf } from '../support/feed-rig';

let rig: FeedRig;
let test: TestStore;
let server: FeedServer;
let service: FeedService;
let ownerId: string;
let memberId: string;

beforeEach(async () => {
  rig = await FeedRig.start();
  ({ test, server, service, ownerId, memberId } = rig);
});

afterEach(async () => {
  await rig.close();
});

describe('who may subscribe where', () => {
  it('refuses a home network address for a member and stores why', async () => {
    server.serve('/family.ics', fixture('apple.ics'));
    const collection = rig.subscribe(memberId, '/family.ics');
    const row = await service.subscriptions.refresh(collection.id);
    expect(row.feed).toMatchObject({ fetched_at: null });
    expect(failureOf(row)).toContain('only the owner');
    expect(rig.rowsOf(collection)).toEqual([]);
    expect(server.seen).toEqual([]);
  });

  it('refuses a hostname that resolves to the hub for a member', async () => {
    const url = new URL(server.url('/family.ics').replace('127.0.0.1', 'localhost'));
    await expect(
      fetchFeed({
        url,
        etag: null,
        lastModified: null,
        allowPrivate: false,
        signal: AbortSignal.timeout(5000),
      }),
    ).rejects.toMatchObject({ code: 'ELOCALNET' });
    expect(server.seen).toEqual([]);
  });

  it('refuses private, link-local and loopback literals for a member', async () => {
    for (const host of ['10.1.2.3', '192.168.1.5', '169.254.169.254', '[::1]', '172.20.0.1']) {
      await expect(
        fetchFeed({
          url: new URL(`http://${host}/feed.ics`),
          etag: null,
          lastModified: null,
          allowPrivate: false,
          signal: AbortSignal.timeout(5000),
        }),
      ).rejects.toThrow(/only the owner/u);
    }
  });

  it('lets the owner subscribe to a home network address', async () => {
    server.serve('/family.ics', fixture('apple.ics'));
    const collection = rig.subscribe(ownerId, '/family.ics');
    await service.subscriptions.refresh(collection.id);
    expect(rig.rowsOf(collection)).toHaveLength(5);
  });

  it('turns webcal into https and refuses other schemes', () => {
    expect(feedUrlOf('webcal://example.com/a.ics').href).toBe('https://example.com/a.ics');
    expect(() => feedUrlOf('ftp://example.com/a.ics')).toThrow(/http, https or webcal/u);
    expect(() => feedUrlOf('not a url')).toThrow(/web address/u);
  });
});

describe('feed kinds', () => {
  it('creates a subscription, names it after the address and fetches at once', async () => {
    server.serve('/family.ics', fixture('apple.ics'));
    const created = await service.registry.of('ics').create({
      profileId: ownerId,
      input: {
        kind: 'ics',
        url: server.url('/family.ics'),
        refresh_minutes: 360,
        colour: 'family',
      },
    });
    expect(created).toMatchObject({ source: 'feed', name: '127.0.0.1', colour: 'family' });
    expect(created.feed).toMatchObject({ fetched_at: START });
    expect(rig.rowsOf(created)).toHaveLength(5);
  });

  it('refuses to create a member subscription to a home network address', async () => {
    await expect(
      service.registry.of('ics').create({
        profileId: memberId,
        input: { kind: 'ics', url: server.url('/family.ics'), refresh_minutes: 360 },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(test.store.plannerCollections.list(memberId)).toEqual([]);
  });

  it('changes the refresh time without fetching and resets validators when the address moves', async () => {
    server.serve('/one.ics', fixture('apple.ics'), { etag: '"one"' });
    server.serve('/two.ics', fixture('google.ics'), { etag: '"two"' });
    const created = await service.registry.of('ics').create({
      profileId: ownerId,
      input: { kind: 'ics', url: server.url('/one.ics'), refresh_minutes: 360 },
    });
    const requests = server.seen.length;
    const faster = await service.registry.of('ics').update(created, { refresh_minutes: 30 });
    expect(faster.feed).toMatchObject({ refresh_minutes: 30, etag: '"one"' });
    expect(server.seen).toHaveLength(requests);
    const moved = await service.registry.of('ics').update(faster, { url: server.url('/two.ics') });
    expect(moved.feed).toMatchObject({ etag: '"two"' });
    expect(rig.rowsOf(moved)).toContain('Standup');
    expect(rig.rowsOf(moved)).not.toContain('Dinner');
  });

  it('refuses country changes on a subscription and unknown kinds', async () => {
    server.serve('/one.ics', fixture('apple.ics'));
    const created = await service.registry.of('ics').create({
      profileId: ownerId,
      input: { kind: 'ics', url: server.url('/one.ics'), refresh_minutes: 360 },
    });
    await expect(
      service.registry.of('ics').update(created, { country: 'DE' }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(() => new FeedRegistry().of('holidays')).toThrow(FeedKindUnavailableError);
  });

  it('prepares nothing for a subscription when a read reaches a window', () => {
    const collection = rig.subscribe(ownerId, '/family.ics');
    expect(() => {
      service.registry.prepare([collection], { from: START, to: START });
    }).not.toThrow();
  });
});
