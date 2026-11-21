import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import {
  PLANNER_EXPORT_LINK,
  PLANNER_IMPORT_RESULT,
  createClientToken,
  hashClientToken,
  matchPath,
  type PlannerCollectionRow,
  type PlannerExportLink,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plannerFeedRoutes } from '../../src/server/handlers/planner-feeds';
import type { FeedService } from '../../src/planner/feeds';
import { FeedRegistry } from '../../src/planner/feeds/registry';
import { apiErrorFor } from '../../src/server/errors';
import type { RawRoute } from '../../src/server/http-server';
import { plannerIcalRoutes } from '../../src/server/planner-ical-routes';
import type { Caller } from '../../src/server/auth';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { inProcessCalendars } from '../support/ical';

const NOW = new Date('2026-11-14T12:00:00.000Z');

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'ical', name), 'utf8');

interface Person {
  readonly profileId: string;
  readonly token: string;
  readonly caller: Caller;
}

let test: TestStore;
let server: Server;
let base: string;
let owner: Person;
let ann: Person;
let bob: Person;
let calendar: PlannerCollectionRow;

function person(profileId: string, name: string, role: 'owner' | 'member'): Person {
  const token = createClientToken();
  const client = test.store.clients.create({
    name: `${name} phone`,
    platform: 'android',
    role,
    tokenHash: hashClientToken(token),
    profileId,
  });
  return { profileId, token, caller: { kind: 'client', client } };
}

function serveRoutes(routes: readonly RawRoute[]): Promise<void> {
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://x').pathname;
    const route = routes.find(
      (entry) => entry.method === request.method && matchPath(entry.path, pathname) !== null,
    );
    const params = route === undefined ? null : matchPath(route.path, pathname);
    if (route === undefined || params === null) {
      response.writeHead(404);
      response.end();
      return;
    }
    route.handle(request, response, params).catch((cause: unknown) => {
      const error = apiErrorFor(cause);
      if (error === null) throw cause;
      response.writeHead(error.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(error.body()));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('no port');
      base = `http://127.0.0.1:${String(address.port)}`;
      resolve();
    });
  });
}

function asPerson(who: Person, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${who.token}`, ...extra };
}

beforeEach(async () => {
  test = await testStore(() => NOW);
  const first = test.store.profiles.list()[0];
  if (first === undefined) throw new Error('the store has no owner');
  owner = person(first.id, 'Owner', 'owner');
  ann = person(test.store.profiles.create({ name: 'Ann' }).id, 'Ann', 'member');
  bob = person(test.store.profiles.create({ name: 'Bob' }).id, 'Bob', 'member');
  calendar = test.store.plannerCollections.insert({
    profile_id: ann.profileId,
    kind: 'calendar',
    name: 'Family: plans/2026',
    colour: 'family',
    icon: 'calendar',
    position: 1,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
  });
  await serveRoutes(
    plannerIcalRoutes({
      store: test.store,
      calendars: inProcessCalendars,
      now: () => NOW,
      log: testLogger('ical'),
    }),
  );
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  await test.close();
});

const importUrl = (id: string, query = ''): string =>
  `${base}/api/planner/collections/${id}/import${query}`;

describe('import route', () => {
  it('imports a calendar sent as text/calendar and answers with the report', async () => {
    const response = await fetch(importUrl(calendar.id), {
      method: 'POST',
      headers: asPerson(ann, { 'content-type': 'text/calendar' }),
      body: fixture('google.ics'),
    });
    expect(response.status).toBe(200);
    const result = PLANNER_IMPORT_RESULT.parse(await response.json());
    expect(result.added).toBe(3);
    expect(result.unsupported.length).toBeGreaterThan(0);
    expect(test.store.plannerItems.inCollection(calendar.id)).toHaveLength(4);
  });

  it('refuses JSON, garbage, strangers, other people and subscribed calendars', async () => {
    const send = (
      headers: Record<string, string>,
      body: string,
      url = importUrl(calendar.id),
    ): Promise<Response> => fetch(url, { method: 'POST', headers, body });
    expect((await send(asPerson(ann, { 'content-type': 'application/json' }), '{}')).status).toBe(
      415,
    );
    expect((await send(asPerson(ann, { 'content-type': 'text/calendar' }), 'garbage')).status).toBe(
      400,
    );
    expect((await send({ 'content-type': 'text/calendar' }, fixture('apple.ics'))).status).toBe(
      401,
    );
    expect(
      (await send(asPerson(bob, { 'content-type': 'text/calendar' }), fixture('apple.ics'))).status,
    ).toBe(404);
    const { id: _id, created_at: _created, updated_at: _updated, ...fields } = calendar;
    const feed = test.store.plannerCollections.insert({
      ...fields,
      name: 'Subscribed',
      source: 'feed',
      feed: {
        kind: 'ics',
        url: 'https://example.com/a.ics',
        refresh_minutes: 360,
        etag: null,
        last_modified: null,
        fetched_at: null,
        failure: null,
      },
    });
    expect(
      (
        await send(
          asPerson(ann, { 'content-type': 'text/calendar' }),
          fixture('apple.ics'),
          importUrl(feed.id),
        )
      ).status,
    ).toBe(400);
    expect(test.store.plannerItems.inCollection(calendar.id)).toEqual([]);
  });

  it('lets the owner import for another person', async () => {
    const response = await fetch(importUrl(calendar.id, `?personId=${ann.profileId}`), {
      method: 'POST',
      headers: asPerson(owner, { 'content-type': 'text/calendar' }),
      body: fixture('apple.ics'),
    });
    expect(response.status).toBe(200);
    expect(test.store.plannerItems.inCollection(calendar.id)).toHaveLength(5);
  });
});

describe('shared calendars', () => {
  const sharedWith = (role: 'view' | 'edit'): void => {
    test.store.plannerShares.save({
      collection_id: calendar.id,
      profile_id: bob.profileId,
      role,
    });
  };

  it('lets a person the calendar is shared with export it and import only with edit rights', async () => {
    sharedWith('view');
    const exported = await fetch(`${base}/api/planner/collections/${calendar.id}/export.ics`, {
      headers: asPerson(bob),
    });
    expect(exported.status).toBe(200);
    const send = (): Promise<Response> =>
      fetch(importUrl(calendar.id), {
        method: 'POST',
        headers: asPerson(bob, { 'content-type': 'text/calendar' }),
        body: fixture('apple.ics'),
      });
    expect((await send()).status).toBe(403);
    sharedWith('edit');
    expect((await send()).status).toBe(200);
    expect(
      test.store.plannerItems
        .inCollection(calendar.id)
        .every((item) => item.profile_id === ann.profileId),
    ).toBe(true);
  });
});

describe('export routes', () => {
  it('downloads a calendar as a named .ics file', async () => {
    await fetch(importUrl(calendar.id), {
      method: 'POST',
      headers: asPerson(ann, { 'content-type': 'text/calendar' }),
      body: fixture('google.ics'),
    });
    const response = await fetch(`${base}/api/planner/collections/${calendar.id}/export.ics`, {
      headers: asPerson(ann),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''Family%20plans2026.ics",
    );
    const text = await response.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('SUMMARY:Standup');
  });

  it('downloads one event and refuses what the caller may not see', async () => {
    const item = test.store.plannerItems.insert({
      profile_id: ann.profileId,
      collection_id: calendar.id,
      kind: 'event',
      parent_id: null,
      title: 'Picnic',
      notes: '',
      location: null,
      priority: null,
      tags: [],
      estimate_minutes: null,
      start_local: '2026-11-20',
      end_local: null,
      time_zone: null,
      all_day: true,
      due_date: null,
      due_at: null,
      rrule: null,
      exdates: [],
      series_id: null,
      original_start: null,
      start: '2026-11-20T00:00:00.000Z',
      end: null,
      series_end: null,
      status: 'open',
      position: 0,
      completion: { kind: 'manual' },
      attachments: [],
      reminders: [],
      google: null,
      assignee_id: null,
      ical_uid: null,
      ical_sequence: 0,
      booking_page_id: null,
      created_by: 'person',
    });
    const url = `${base}/api/planner/items/${item.id}/export.ics`;
    const own = await fetch(url, { headers: asPerson(ann) });
    expect(own.status).toBe(200);
    expect(await own.text()).toContain(`UID:${item.id}@smarteverything`);
    expect((await fetch(url, { headers: asPerson(bob) })).status).toBe(404);
    expect((await fetch(url)).status).toBe(401);
    const missing = `${base}/api/planner/collections/${calendar.id}/export.ics?personId=nope`;
    expect((await fetch(missing, { headers: asPerson(ann) })).status).toBe(400);
  });
});

describe('published feed', () => {
  function links(
    origin: { url: string; public: boolean } = { url: 'http://hub.test', public: false },
  ): ReturnType<typeof plannerFeedRoutes> {
    const feeds: Pick<FeedService, 'registry'> = { registry: new FeedRegistry() };
    return plannerFeedRoutes({ store: test.store }, { feeds, origin: () => origin });
  }

  const call = (route: Bound, who: Person): Promise<unknown> =>
    route.run(
      who.caller,
      {
        params: { collectionId: calendar.id },
        query: {},
        body: undefined,
        remote: 'test',
        headers: {},
      },
      testLogger(),
    );

  const linkOf = async (route: Bound, who: Person): Promise<PlannerExportLink> =>
    PLANNER_EXPORT_LINK.parse(await call(route, who));

  it('publishes, shows again, resets and stops a secret address', async () => {
    const routes = links();
    expect(await call(routes.readPlannerExportLink, ann)).toBeNull();
    const first = await linkOf(routes.createPlannerExportLink, ann);
    expect(first.url).toBe(`http://hub.test/cal/${first.token}.ics`);
    expect(first.reach).toBe('home');
    expect(await call(routes.readPlannerExportLink, ann)).toEqual(first);
    const second = await linkOf(routes.createPlannerExportLink, ann);
    expect(second.token).not.toBe(first.token);
    expect((await fetch(`${base}/cal/${first.token}.ics`)).status).toBe(404);
    expect((await fetch(`${base}/cal/${second.token}.ics`)).status).toBe(200);
    await call(routes.deletePlannerExportLink, ann);
    expect((await fetch(`${base}/cal/${second.token}.ics`)).status).toBe(404);
    expect(await call(routes.readPlannerExportLink, ann)).toBeNull();
  });

  it('says whether the address reaches outside the home', async () => {
    const routes = links({ url: 'https://smart.example.com/', public: true });
    const link = await linkOf(routes.createPlannerExportLink, ann);
    expect(link).toMatchObject({ reach: 'public' });
    expect(link.url).toBe(`https://smart.example.com/cal/${link.token}.ics`);
  });

  it('leaves guests out of the published feed and keeps them in the download', async () => {
    await fetch(importUrl(calendar.id), {
      method: 'POST',
      headers: asPerson(ann, { 'content-type': 'text/calendar' }),
      body: fixture('google.ics'),
    });
    const link = await linkOf(links().createPlannerExportLink, ann);
    const published = await (await fetch(`${base}/cal/${link.token}.ics`)).text();
    expect(published).toContain('BEGIN:VEVENT');
    expect(published).not.toContain('ATTENDEE');
    expect(published).not.toContain('sam@example.com');
  });

  it('serves the calendar to anyone with the address and answers conditional requests', async () => {
    await fetch(importUrl(calendar.id), {
      method: 'POST',
      headers: asPerson(ann, { 'content-type': 'text/calendar' }),
      body: fixture('apple.ics'),
    });
    const link = await linkOf(links().createPlannerExportLink, ann);
    const response = await fetch(`${base}/cal/${link.token}.ics`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(await response.text()).toContain('SUMMARY:Dinner');
    const tag = response.headers.get('etag') ?? '';
    const again = await fetch(`${base}/cal/${link.token}.ics`, {
      headers: { 'if-none-match': tag },
    });
    expect(again.status).toBe(304);
  });

  it('refuses a made-up or malformed address and another person managing the link', async () => {
    expect((await fetch(`${base}/cal/${'a'.repeat(43)}.ics`)).status).toBe(404);
    expect((await fetch(`${base}/cal/short.ics`)).status).toBe(404);
    await expect(call(links().createPlannerExportLink, bob)).rejects.toThrow(
      /That calendar or list does not exist/u,
    );
  });
});
