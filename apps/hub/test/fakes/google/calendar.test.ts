import { describe, expect, it } from 'vitest';
import type { EventCollection } from './calendar-events';
import { CALENDAR_API, eventsUrl, itemsOf, link, session, textOf, type Api } from './helpers';
import { createFakeGoogle, type FakeGoogle } from './index';

const EMAIL = 'owner@example.test';
const TIMED = {
  start: { dateTime: '2026-11-09T10:00:00Z' },
  end: { dateTime: '2026-11-09T11:00:00Z' },
};
const SYNC_QUERY = 'showDeleted=true&singleEvents=false';

interface Setup {
  readonly google: FakeGoogle;
  readonly api: Api;
  readonly events: EventCollection;
}

async function setup(): Promise<Setup> {
  const google = createFakeGoogle();
  const tokens = await link(google, EMAIL);
  const events = google.account(EMAIL).calendars.events('primary');
  return { google, api: session(google, tokens.access_token), events };
}

describe('fake Google Calendar events', () => {
  it('pages a full list, then serves only changes for the sync token', async () => {
    const { api, events } = await setup();
    for (let index = 0; index < 5; index += 1)
      events.insert({ summary: `e${String(index)}`, ...TIMED });
    const query = `${SYNC_QUERY}&maxResults=2`;
    const first = await api.get(eventsUrl(EMAIL, query));
    expect(itemsOf(first)).toHaveLength(2);
    expect(first.body['nextSyncToken']).toBeUndefined();
    const second = await api.get(
      eventsUrl(EMAIL, `${query}&pageToken=${textOf(first, 'nextPageToken')}`),
    );
    const third = await api.get(
      eventsUrl(EMAIL, `${query}&pageToken=${textOf(second, 'nextPageToken')}`),
    );
    expect(itemsOf(second)).toHaveLength(2);
    expect(itemsOf(third)).toHaveLength(1);
    const created = await api.post(eventsUrl(EMAIL), {
      summary: 'late',
      ...TIMED,
    });
    const incremental = await api.get(
      eventsUrl(EMAIL, `${SYNC_QUERY}&syncToken=${textOf(third, 'nextSyncToken')}`),
    );
    expect(itemsOf(incremental)).toEqual([created.body]);
    expect(incremental.body['nextSyncToken']).toBeDefined();
  });

  it('answers 410 for an invalidated sync token and serves a fresh full list', async () => {
    const { api, events } = await setup();
    events.insert({ summary: 'one', ...TIMED });
    const full = await api.get(eventsUrl(EMAIL, SYNC_QUERY));
    events.invalidateSyncTokens();
    const gone = await api.get(
      eventsUrl(EMAIL, `${SYNC_QUERY}&syncToken=${textOf(full, 'nextSyncToken')}`),
    );
    expect(gone.status).toBe(410);
    expect(gone.body).toMatchObject({ error: { errors: [{ reason: 'fullSyncRequired' }] } });
    const again = await api.get(eventsUrl(EMAIL, SYNC_QUERY));
    expect(itemsOf(again)).toHaveLength(1);
  });

  it('rejects filters that cannot be combined with sync and a mismatched token', async () => {
    const { api } = await setup();
    const filtered = await api.get(eventsUrl(EMAIL, 'timeMin=2026-01-01T00:00:00Z'));
    expect(filtered.status).toBe(400);
    const full = await api.get(eventsUrl(EMAIL, SYNC_QUERY));
    const sync = textOf(full, 'nextSyncToken');
    const noDeleted = await api.get(eventsUrl(EMAIL, `showDeleted=false&syncToken=${sync}`));
    expect(noDeleted.status).toBe(400);
    const expanded = await api.get(eventsUrl(EMAIL, 'singleEvents=true'));
    expect(expanded.status).toBe(400);
  });

  it('enforces If-Match on patch and changes the etag on every write', async () => {
    const { api } = await setup();
    const created = await api.post(eventsUrl(EMAIL), { summary: 'a', ...TIMED });
    const url = eventsUrl(EMAIL).concat(`/${textOf(created, 'id')}`);
    const etag = textOf(created, 'etag');
    const patched = await api.patch(url, { summary: 'b' }, { 'If-Match': etag });
    expect(patched.status).toBe(200);
    expect(textOf(patched, 'etag')).not.toBe(etag);
    expect(patched.body['summary']).toBe('b');
    expect(patched.body['start']).toEqual(TIMED.start);
    const stale = await api.patch(url, { summary: 'c' }, { 'If-Match': etag });
    expect(stale.status).toBe(412);
    expect(stale.body).toMatchObject({ error: { errors: [{ reason: 'conditionNotMet' }] } });
  });

  it('clears a field with null and merges nested objects on patch', async () => {
    const { api, events } = await setup();
    const created = events.insert({
      summary: 'a',
      location: 'Home',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
      ...TIMED,
    });
    const url = eventsUrl(EMAIL).concat(`/${String(created['id'])}`);
    const patched = await api.patch(url, {
      location: null,
      end: { dateTime: '2026-11-09T12:00:00Z' },
    });
    expect(patched.body['location']).toBeUndefined();
    expect(patched.body['end']).toEqual({ dateTime: '2026-11-09T12:00:00Z' });
    expect(patched.body['sequence']).toBe(1);
  });

  it('turns a delete into a cancelled tombstone that only incremental syncs and showDeleted see', async () => {
    const { api } = await setup();
    const base = await api.get(eventsUrl(EMAIL, SYNC_QUERY));
    const created = await api.post(eventsUrl(EMAIL), { summary: 'x', ...TIMED });
    const url = eventsUrl(EMAIL).concat(`/${textOf(created, 'id')}`);
    expect((await api.del(url)).status).toBe(204);
    expect((await api.get(url)).status).toBe(410);
    expect((await api.del(url)).status).toBe(410);
    const incremental = await api.get(
      eventsUrl(EMAIL, `${SYNC_QUERY}&syncToken=${textOf(base, 'nextSyncToken')}`),
    );
    expect(itemsOf(incremental)).toMatchObject([{ id: created.body['id'], status: 'cancelled' }]);
    const hidden = await api.get(eventsUrl(EMAIL, 'showDeleted=false'));
    expect(itemsOf(hidden)).toHaveLength(0);
    const shown = await api.get(eventsUrl(EMAIL, 'showDeleted=true'));
    expect(itemsOf(shown)).toHaveLength(1);
  });

  it('keeps exactly three identifying fields on a cancelled recurring instance', async () => {
    const { api, events } = await setup();
    events.insert({
      id: 'abcde12345',
      summary: 'daily',
      recurrence: ['RRULE:FREQ=DAILY'],
      ...TIMED,
    });
    const base = await api.get(eventsUrl(EMAIL, SYNC_QUERY));
    const instance = eventsUrl(EMAIL).concat('/abcde12345_20261110T100000Z');
    const edited = await api.patch(instance, { summary: 'moved' });
    expect(edited.body).toMatchObject({
      summary: 'moved',
      recurringEventId: 'abcde12345',
      originalStartTime: { dateTime: '2026-11-10T10:00:00Z' },
      start: { dateTime: '2026-11-10T10:00:00Z' },
      end: { dateTime: '2026-11-10T11:00:00Z' },
    });
    expect(edited.body['recurrence']).toBeUndefined();
    const skipped = eventsUrl(EMAIL).concat('/abcde12345_20261111T100000Z');
    expect((await api.del(skipped)).status).toBe(204);
    const incremental = await api.get(
      eventsUrl(EMAIL, `${SYNC_QUERY}&syncToken=${textOf(base, 'nextSyncToken')}`),
    );
    const tombstone = itemsOf(incremental).find(
      (item) => item['id'] === 'abcde12345_20261111T100000Z',
    );
    expect(Object.keys(tombstone ?? {}).sort()).toEqual([
      'etag',
      'id',
      'kind',
      'originalStartTime',
      'recurringEventId',
      'status',
    ]);
    expect(tombstone).toMatchObject({ status: 'cancelled', recurringEventId: 'abcde12345' });
  });

  it('cancels stored exceptions when the master is deleted', async () => {
    const { api, events } = await setup();
    events.insert({ id: 'master00001', recurrence: ['RRULE:FREQ=DAILY'], ...TIMED });
    events.patch('master00001_20261110T100000Z', { summary: 'edited' }, null);
    const base = await api.get(eventsUrl(EMAIL, SYNC_QUERY));
    await api.del(eventsUrl(EMAIL).concat('/master00001'));
    const incremental = await api.get(
      eventsUrl(EMAIL, `${SYNC_QUERY}&syncToken=${textOf(base, 'nextSyncToken')}`),
    );
    expect(itemsOf(incremental).map((item) => item['status'])).toEqual(['cancelled', 'cancelled']);
  });

  it('accepts a deterministic client id once and validates events', async () => {
    const { api } = await setup();
    const body = { id: 'a1b2c3d4e5f6', summary: 'planned', ...TIMED };
    expect((await api.post(eventsUrl(EMAIL), body)).status).toBe(200);
    const duplicate = await api.post(eventsUrl(EMAIL), body);
    expect(duplicate.status).toBe(409);
    const invalidId = await api.post(eventsUrl(EMAIL), {
      ...body,
      id: 'UPPER_CASE',
    });
    expect(invalidId.status).toBe(400);
    const reminders = await api.post(eventsUrl(EMAIL), {
      summary: 'r',
      ...TIMED,
      reminders: {
        useDefault: false,
        overrides: Array.from({ length: 6 }, () => ({ method: 'popup', minutes: 5 })),
      },
    });
    expect(reminders.status).toBe(400);
    const backwards = await api.post(eventsUrl(EMAIL), {
      summary: 'b',
      start: { dateTime: '2026-11-09T11:00:00Z' },
      end: { dateTime: '2026-11-09T10:00:00Z' },
    });
    expect(backwards.status).toBe(400);
  });

  it('refuses writes to a read-only calendar and serves its events', async () => {
    const { google, api } = await setup();
    const holidays = google
      .account(EMAIL)
      .calendars.add({ id: 'holidays@group.test', summary: 'Holidays', accessRole: 'reader' });
    holidays.insert({
      summary: 'Day off',
      start: { date: '2026-12-25' },
      end: { date: '2026-12-26' },
    });
    const write = await api.post(eventsUrl('holidays@group.test'), {
      summary: 'no',
      ...TIMED,
    });
    expect(write.status).toBe(403);
    const read = await api.get(eventsUrl('holidays@group.test', SYNC_QUERY));
    expect(itemsOf(read)).toMatchObject([{ summary: 'Day off' }]);
  });

  it('syncs the calendar list with a deleted entry', async () => {
    const { google, api } = await setup();
    const calendars = google.account(EMAIL).calendars;
    calendars.add({ id: 'family@group.test', summary: 'Family', accessRole: 'writer' });
    const query = 'showDeleted=true&showHidden=true';
    const full = await api.get(`${CALENDAR_API}/users/me/calendarList?${query}`);
    expect(itemsOf(full).map((item) => item['id'])).toEqual([EMAIL, 'family@group.test']);
    calendars.remove('family@group.test');
    const incremental = await api.get(
      `${CALENDAR_API}/users/me/calendarList?${query}&syncToken=${textOf(full, 'nextSyncToken')}`,
    );
    expect(itemsOf(incremental)).toMatchObject([{ id: 'family@group.test', deleted: true }]);
    expect((await api.get(eventsUrl('family@group.test'))).status).toBe(404);
  });

  it('reports a remote edit by another client in the next incremental sync', async () => {
    const { api, events } = await setup();
    const created = events.insert({ summary: 'mine', ...TIMED });
    const base = await api.get(eventsUrl(EMAIL, SYNC_QUERY));
    events.patch(String(created['id']), { summary: 'theirs' }, null);
    const incremental = await api.get(
      eventsUrl(EMAIL, `${SYNC_QUERY}&syncToken=${textOf(base, 'nextSyncToken')}`),
    );
    expect(itemsOf(incremental)).toMatchObject([{ summary: 'theirs' }]);
  });
});
