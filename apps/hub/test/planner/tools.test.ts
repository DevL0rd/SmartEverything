import { API_ENDPOINTS as E, PLANNER_COLLECTION_ROW } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemClock } from '../../src/clock';
import { callTool, structured } from '../mcp/client';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

const NOW = '2026-11-09T10:00:00.000Z';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;
let collectionId: string;
let robinId: string;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path, {
    clock: { ...systemClock, now: () => new Date(NOW) },
  });
  await verifiedPublicUrl(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'Planner' },
  });
  token = E.createMcpToken.response.parse(created.body).token;
  const collection = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/planner/collections',
    body: { kind: 'list', name: 'Chores', colour: 'family', icon: 'check' },
  });
  collectionId = PLANNER_COLLECTION_ROW.parse(collection.body).id;
  const robin = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/profiles',
    body: { name: 'Robin' },
  });
  robinId = E.createProfile.response.parse(robin.body).id;
});

function succeeded(result: Awaited<ReturnType<typeof callTool>>): void {
  expect(result.isError, JSON.stringify(result.content)).toBe(false);
}

function edit(args: Record<string, unknown>): ReturnType<typeof callTool> {
  return callTool(booted.base, token, 'planner_edit', args);
}

function read(args: Record<string, unknown>): ReturnType<typeof callTool> {
  return callTool(booted.base, token, 'planner_read', args);
}

async function event(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const added = await edit({
    action: 'add',
    item: {
      collection_id: collectionId,
      kind: 'event',
      title,
      start_local: '2026-11-10T19:00',
      end_local: '2026-11-10T20:00',
      time_zone: 'UTC',
      ...extra,
    },
  });
  succeeded(added);
  return z.uuid().parse(structured(added)['id']);
}

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

describe('the planner tools over MCP', () => {
  it('adds a task and reads it back as an open task', async () => {
    const added = await callTool(booted.base, token, 'planner_edit', {
      action: 'add',
      item: { collection_id: collectionId, kind: 'task', title: 'Bins' },
    });
    succeeded(added);
    const read = structured(await callTool(booted.base, token, 'planner_read', { view: 'tasks' }));
    expect(read).toMatchObject({
      result: { tasks: [{ title: 'Bins', status: 'open', created_by: 'person' }] },
    });
  });

  it('proposes drafts the person has not accepted yet', async () => {
    const proposed = await callTool(booted.base, token, 'planner_edit', {
      action: 'propose',
      items: [{ collection_id: collectionId, kind: 'task', title: 'Tidy' }],
    });
    succeeded(proposed);
    const tasks = structured(await callTool(booted.base, token, 'planner_read', { view: 'tasks' }));
    expect(tasks).toMatchObject({ result: { tasks: [] } });
    const [draft] = z.array(z.uuid()).parse(structured(proposed)['ids']);
    const item = structured(
      await callTool(booted.base, token, 'planner_read', { view: 'item', itemId: draft }),
    );
    expect(item).toMatchObject({
      result: { item: { title: 'Tidy', status: 'proposed', created_by: 'ai' } },
    });
  });

  it('reads an empty clock and an unlinked Google account', async () => {
    expect(
      structured(await callTool(booted.base, token, 'planner_read', { view: 'alarms' })),
    ).toMatchObject({ result: { rows: [] } });
    expect(
      structured(await callTool(booted.base, token, 'planner_read', { view: 'google_status' })),
    ).toMatchObject({ result: { linked: false, account: null } });
  });

  it('refuses a field the chosen view does not take and a missing required field', async () => {
    const extra = await callTool(booted.base, token, 'planner_read', {
      view: 'stats',
      range: 'week',
      date: '2026-11-09',
    });
    expect(extra.isError).toBe(true);
    const missing = await callTool(booted.base, token, 'planner_edit', { action: 'complete' });
    expect(missing.isError).toBe(true);
  });

  it('finds events by words in the planner search and in home_search', async () => {
    await event('Dentist visit');
    const found = structured(await read({ view: 'search', text: 'dentist' }));
    expect(found).toMatchObject({ result: { hits: [{ occurrence: { title: 'Dentist visit' } }] } });
    const home = structured(
      await callTool(booted.base, token, 'home_search', { query: 'dentist' }),
    );
    expect(home).toMatchObject({ planner: [{ title: 'Dentist visit', kind: 'event' }] });
  });

  it('sets guests, answers for a member guest and reads the guest list', async () => {
    const id = await event('Birthday dinner');
    const set = await edit({
      action: 'guests_set',
      itemId: id,
      guests: [{ kind: 'person', profile_id: robinId }],
    });
    succeeded(set);
    const guests = structured(await read({ view: 'guests', itemId: id }));
    expect(guests).toMatchObject({
      result: { guests: [{ kind: 'person', profile_id: robinId, response: 'needs_action' }] },
    });
    const answered = await callTool(booted.base, token, 'planner_edit', {
      action: 'rsvp',
      personId: robinId,
      itemId: id,
      rsvp: { response: 'yes' },
    });
    succeeded(answered);
    expect(structured(await read({ view: 'guests', itemId: id }))).toMatchObject({
      result: { guests: [{ response: 'yes' }] },
    });
  });

  it('shares a calendar and takes the share back', async () => {
    const shared = await edit({
      action: 'share',
      collectionId,
      withPersonId: robinId,
      role: 'view',
    });
    succeeded(shared);
    expect(structured(await read({ view: 'sharing' }))).toMatchObject({
      result: { shared_by_me: [{ shares: [{ profile_id: robinId, role: 'view' }] }] },
    });
    const withdrawn = await edit({ action: 'unshare', collectionId, withPersonId: robinId });
    succeeded(withdrawn);
    expect(structured(await read({ view: 'sharing' }))).toMatchObject({
      result: { shared_by_me: [] },
    });
  });

  it('assigns a task with update and gives it a step', async () => {
    const added = await edit({
      action: 'add',
      item: { collection_id: collectionId, kind: 'task', title: 'Bins' },
    });
    const parent = z.uuid().parse(structured(added)['id']);
    const assigned = await edit({
      action: 'update',
      itemId: parent,
      changes: { assignee_id: robinId },
    });
    succeeded(assigned);
    const step = await edit({
      action: 'add',
      item: { collection_id: collectionId, kind: 'task', title: 'Carry out', parent_id: parent },
    });
    succeeded(step);
    expect(structured(await read({ view: 'item', itemId: parent }))).toMatchObject({
      result: {
        item: { assignee_id: robinId },
        children: [{ title: 'Carry out' }],
      },
    });
  });

  it('adds a birthdays calendar and lists it as a subscription', async () => {
    const added = await edit({ action: 'feed_add', feed: { kind: 'birthdays' } });
    succeeded(added);
    expect(structured(await read({ view: 'feeds' }))).toMatchObject({
      result: { subscriptions: [{ feed: { kind: 'birthdays' } }], published: [] },
    });
  });

  it('imports an .ics file and publishes then stops a feed address', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//test//EN',
      'BEGIN:VEVENT',
      'UID:one@test',
      'DTSTAMP:20261109T070000Z',
      'DTSTART:20261112T090000Z',
      'DTEND:20261112T100000Z',
      'SUMMARY:Imported meeting',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const imported = await edit({ action: 'import_ics', collectionId, ics });
    succeeded(imported);
    expect(structured(await read({ view: 'search', text: 'imported' }))).toMatchObject({
      result: { hits: [{ occurrence: { title: 'Imported meeting' } }] },
    });
    const published = await edit({ action: 'export_link', collectionId, link: 'publish' });
    succeeded(published);
    expect(structured(await read({ view: 'feeds' }))).toMatchObject({
      result: { published: [{ collection_id: collectionId }] },
    });
    await edit({ action: 'export_link', collectionId, link: 'stop' });
    expect(structured(await read({ view: 'feeds' }))).toMatchObject({
      result: { published: [] },
    });
  });

  it('sets, lists and removes a booking page', async () => {
    const own = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/planner/collections',
      body: { kind: 'calendar', name: 'Bookings', colour: 'work', icon: 'calendar' },
    });
    const calendarId = PLANNER_COLLECTION_ROW.parse(own.body).id;
    const set = await edit({
      action: 'booking_page_set',
      page: {
        collection_id: calendarId,
        title: 'Coffee chat',
        minutes: 30,
        availability: [
          { day: 1, start: '09:00', end: '12:00' },
          { day: 2, start: '09:00', end: '12:00' },
        ],
        notice_minutes: 60,
        ahead_days: 30,
      },
    });
    succeeded(set);
    const pageId = z.uuid().parse(structured(set)['id']);
    const changed = await edit({
      action: 'booking_page_set',
      pageId,
      pageChanges: { enabled: false },
    });
    succeeded(changed);
    expect(structured(await read({ view: 'booking_pages' }))).toMatchObject({
      result: { rows: [{ title: 'Coffee chat', enabled: false }] },
    });
    await edit({ action: 'booking_page_remove', pageId });
    expect(structured(await read({ view: 'booking_pages' }))).toMatchObject({
      result: { rows: [] },
    });
  });

  it('sets the bedtime and reads it back with the sleep nights', async () => {
    const current = structured(await read({ view: 'bedtime' }));
    const bedtime = {
      ...z.looseObject({ result: z.looseObject({ bedtime: z.looseObject({}) }) }).parse(current)
        .result.bedtime,
      enabled: true,
      schedule: [{ days: [1, 2, 3, 4, 5], bed: '22:30', wake: '06:30' }],
      reminder_minutes: 30,
    };
    const set = await edit({ action: 'bedtime_set', bedtime });
    succeeded(set);
    expect(structured(await read({ view: 'bedtime' }))).toMatchObject({
      result: { bedtime: { enabled: true, reminder_minutes: 30 } },
    });
    const sleep = structured(
      await read({
        view: 'sleep',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-09T00:00:00.000Z',
      }),
    );
    expect(sleep).toMatchObject({ result: { nights: [] } });
  });

  it('refuses fields a chosen planner view or action does not take', async () => {
    expect((await read({ view: 'search' })).isError).toBe(true);
    expect((await read({ view: 'bedtime', text: 'x' })).isError).toBe(true);
    expect((await edit({ action: 'share', collectionId })).isError).toBe(true);
  });
});
