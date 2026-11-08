import { join } from 'node:path';
import type { PlannerItemRow } from '@smarteverything/domain';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoogleLink } from '../../src/google/link';
import { GoogleTokens } from '../../src/google/tokens';
import { instantsOf } from '../../src/planner/instants';
import { GoogleCalendarSync } from '../../src/planner/google/calendar-sync';
import { editItem } from '../../src/planner/series-edit';
import { SecretStore } from '../../src/secrets/store';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import {
  createFakeGoogle,
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  type CalendarSpec,
  type FakeGoogle,
} from '../fakes/google';
import { testStore, type TestStore } from '../support/store';

const EMAIL = 'ann@example.test';
const REDIRECT = 'http://127.0.0.1:53682/callback';
const BERLIN = 'Europe/Berlin';

type Events = ReturnType<ReturnType<FakeGoogle['account']>['calendars']['events']>;

interface Rig {
  readonly tokens: GoogleTokens;
  readonly google: FakeGoogle;
  readonly test: TestStore;
  readonly ann: string;
  readonly sync: GoogleCalendarSync;
}

let rig: Rig;

function timed(hour: number, day = 10): object {
  const at = (h: number): object => ({
    dateTime: `2026-11-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00+01:00`,
    timeZone: BERLIN,
  });
  return { start: at(hour), end: at(hour + 1) };
}

async function build(calendars: readonly CalendarSpec[] = []): Promise<Rig> {
  const google = createFakeGoogle();
  const test = await testStore(() => google.clock.now());
  const { store } = test;
  const ann = store.profiles.create({ name: 'Ann' }).id;
  const secrets = await SecretStore.open(join(test.directory, 'secrets'), Buffer.alloc(32, 7));
  await secrets.saveGoogleApp({
    desktop: { clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET },
    android: null,
  });
  const nowMs = (): number => google.clock.nowMs();
  const tokens = new GoogleTokens({
    secrets,
    accounts: store.googleAccounts,
    fetch: google.fetch,
    nowMs,
  });
  const link = new GoogleLink({
    secrets,
    accounts: store.googleAccounts,
    tokens,
    fetch: google.fetch,
  });
  const started = link.begin({
    profileId: ann,
    client: 'desktop',
    redirectUri: REDIRECT,
    request: { calendar: 'write', tasks: 'write' },
  });
  const consent = google.oauth.consent(started.authorizationUrl, EMAIL);
  await link.complete({
    profileId: ann,
    state: started.state,
    code: consent.code,
    redirectUri: REDIRECT,
  });
  for (const spec of calendars) google.account(EMAIL).calendars.add(spec);
  store.googleAccounts.update(ann, { calendar_ids: [EMAIL, ...calendars.map((spec) => spec.id)] });
  const sync = new GoogleCalendarSync({
    store,
    tokens,
    fetch: google.fetch,
    now: (): Date => google.clock.now(),
  });
  return { tokens, google, test, ann, sync };
}

const remote = (id = EMAIL): Events => rig.google.account(EMAIL).calendars.events(id);

const items = (): PlannerItemRow[] => rig.test.store.plannerItems.list(rig.ann);
const pull = (): ReturnType<GoogleCalendarSync['sync']> => rig.sync.sync(rig.ann, 'manual');
const titled = (title: string): PlannerItemRow => {
  const found = items().find((item) => item.title === title);
  if (found === undefined) throw new Error(`no item ${title}`);
  return found;
};

function localEvent(title: string, extra: Partial<PlannerItemInput> = {}): PlannerItemRow {
  const collection = rig.test.store.plannerCollections.byGoogle(rig.ann, EMAIL);
  if (collection === undefined) throw new Error('not mirrored');
  const timing = {
    start_local: '2026-11-12T10:00:00',
    end_local: '2026-11-12T11:00:00',
    time_zone: BERLIN,
    all_day: false,
    rrule: null,
    ...extra,
  };
  return rig.test.store.plannerItems.insert({
    profile_id: rig.ann,
    collection_id: collection.id,
    kind: 'event',
    parent_id: null,
    title,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    due_date: null,
    due_at: null,
    exdates: [],
    series_id: null,
    original_start: null,
    status: 'open',
    position: 100,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    ...timing,
    ...instantsOf({ ...timing, ...extra }),
  });
}

beforeEach(async () => {
  rig = await build();
});

afterEach(async () => {
  await rig.test.close();
});

describe('pull', () => {
  it('mirrors the calendar once with its colour and imports timed, all-day and repeating events', async () => {
    const events = remote();
    events.insert({
      summary: 'Standup',
      ...timed(9),
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
    });
    events.insert({ summary: 'Trip', start: { date: '2026-11-20' }, end: { date: '2026-11-23' } });
    events.insert({
      summary: 'Gym',
      ...timed(18),
      recurrence: ['RRULE:FREQ=DAILY;COUNT=5', 'EXDATE;TZID=Europe/Berlin:20261111T180000'],
    });
    await pull();
    expect(rig.test.store.plannerCollections.list(rig.ann)).toMatchObject([
      { kind: 'calendar', source: 'google', colour: 'family', name: EMAIL },
    ]);
    expect(titled('Standup')).toMatchObject({
      start_local: '2026-11-10T09:00:00',
      end_local: '2026-11-10T10:00:00',
      time_zone: BERLIN,
      start: '2026-11-10T08:00:00.000Z',
      reminders: [{ minutes_before: 10 }],
      created_by: 'google',
    });
    expect(titled('Trip')).toMatchObject({
      all_day: true,
      start_local: '2026-11-20',
      end_local: '2026-11-22',
      time_zone: null,
    });
    expect(titled('Gym')).toMatchObject({
      rrule: 'FREQ=DAILY;COUNT=5',
      exdates: ['2026-11-11T18:00:00'],
      series_end: '2026-11-14T18:00:00.000Z',
    });
    await pull();
    expect(items()).toHaveLength(3);
  });

  it('maps the Google colour to the nearest planner colour at import and never again', async () => {
    rig = await build([
      { id: 'work', summary: 'Work', backgroundColor: '#3159c9' },
      { id: 'home', summary: 'Home', backgroundColor: '#bf3f4e' },
    ]);
    await pull();
    const colours = rig.test.store.plannerCollections
      .list(rig.ann)
      .map((row) => [row.name, row.colour]);
    expect(Object.fromEntries(colours)).toMatchObject({ Work: 'work', Home: 'home' });
    const row = rig.test.store.plannerCollections.byGoogle(rig.ann, 'work');
    rig.test.store.plannerCollections.update(row?.id ?? '', rig.ann, { colour: 'shopping' });
    rig.google.account(EMAIL).calendars.update('work', { backgroundColor: '#bf3f4e' });
    await pull();
    expect(rig.test.store.plannerCollections.byGoogle(rig.ann, 'work')?.colour).toBe('shopping');
  });

  it('applies remote edits and deletes incrementally with the stored sync token and no timeMin', async () => {
    const events = remote();
    const kept = events.insert({ summary: 'Keep', ...timed(9) });
    const gone = events.insert({ summary: 'Drop', ...timed(11) });
    await pull();
    const state = rig.test.store.googleSyncState.find({
      profileId: rig.ann,
      product: 'calendar',
      resourceId: EMAIL,
    });
    expect(state?.sync_token).not.toBeNull();
    events.patch(String(kept['id']), { summary: 'Keep v2' }, null);
    events.remove(String(gone['id']), null);
    rig.google.requests.length = 0;
    const run = await pull();
    const listing = rig.google.requests.filter((request) => request.path.endsWith(`/events`));
    expect(listing).toHaveLength(1);
    expect(listing[0]?.query['syncToken']).toBeDefined();
    expect(listing[0]?.query['timeMin']).toBeUndefined();
    expect(items().map((item) => item.title)).toStrictEqual(['Keep v2']);
    expect(run.counts()).toMatchObject({ updated: 1, deleted: 1 });
  });

  it('follows page tokens across a calendar larger than one page', async () => {
    const events = remote();
    for (let index = 0; index < 2502; index += 1) {
      events.insert({
        summary: `E${String(index)}`,
        start: { date: '2027-01-01' },
        end: { date: '2027-01-02' },
      });
    }
    const run = await pull();
    expect(items()).toHaveLength(2502);
    expect(
      rig.google.requests.filter((request) => request.query['pageToken'] !== undefined),
    ).toHaveLength(1);
    expect(run.counts().created).toBe(2502);
  }, 60_000);

  it('answers a 410 by resyncing that one calendar from scratch', async () => {
    const events = remote();
    events.insert({ summary: 'A', ...timed(9) });
    const b = events.insert({ summary: 'B', ...timed(11) });
    await pull();
    events.remove(String(b['id']), null);
    events.insert({ summary: 'C', ...timed(13) });
    events.invalidateSyncTokens();
    rig.google.requests.length = 0;
    await pull();
    const listings = rig.google.requests.filter((request) => request.path.endsWith('/events'));
    expect(listings.map((request) => request.status)).toStrictEqual([410, 200]);
    expect(listings[1]?.query['syncToken']).toBeUndefined();
    expect(
      items()
        .map((item) => item.title)
        .sort(),
    ).toStrictEqual(['A', 'C']);
    const state = rig.test.store.googleSyncState.find({
      profileId: rig.ann,
      product: 'calendar',
      resourceId: EMAIL,
    });
    expect(state?.sync_token).not.toBeNull();
  });

  it('keeps unsent local edits when a 410 resync no longer finds the event', async () => {
    const events = remote();
    const a = events.insert({ summary: 'A', ...timed(9) });
    await pull();
    rig.test.store.plannerItems.update(titled('A').id, rig.ann, { title: 'A local' });
    events.remove(String(a['id']), null);
    events.invalidateSyncTokens();
    const run = await pull();
    const moved = titled('A local');
    expect(moved.google).toMatchObject({ state: 'synced' });
    expect(moved.google?.id).not.toBe(String(a['id']));
    expect(
      remote()
        .snapshot()
        .filter((event) => event['summary'] === 'A local'),
    ).toHaveLength(1);
    expect(run.conflicts).toMatchObject([{ field: 'deleted', winner: 'app' }]);
  });

  it('maps exceptions to overrides and cancelled instances to excluded dates', async () => {
    const events = remote();
    const master = events.insert({
      summary: 'Practice',
      ...timed(18),
      recurrence: ['RRULE:FREQ=DAILY;COUNT=6'],
    });
    const id = String(master['id']);
    await pull();
    events.patch(`${id}_20261111T170000Z`, { summary: 'Practice moved', ...timed(19, 11) }, null);
    events.remove(`${id}_20261112T170000Z`, null);
    await pull();
    const series = titled('Practice');
    const override = titled('Practice moved');
    expect(override).toMatchObject({
      series_id: series.id,
      original_start: '2026-11-11T18:00:00',
      rrule: null,
      start_local: '2026-11-11T19:00:00',
    });
    expect(series.exdates).toStrictEqual(['2026-11-12T18:00:00']);
    expect(series.google?.base['recurrence']).toStrictEqual([
      'RRULE:FREQ=DAILY;COUNT=6',
      'EXDATE;TZID=Europe/Berlin:20261112T180000',
    ]);
    events.remove(id, null);
    await pull();
    expect(items()).toHaveLength(0);
  });

  it('shows Meet links read-only and keeps other attachments', async () => {
    remote().insert({
      summary: 'Call',
      ...timed(9),
      conferenceData: {
        entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }],
      },
    });
    await pull();
    expect(titled('Call').attachments).toStrictEqual([
      { kind: 'link', url: 'https://meet.google.com/abc-defg-hij', title: 'Google Meet' },
    ]);
  });
});

describe('push', () => {
  it('patches a local edit with If-Match and does not take its own echo as a remote change', async () => {
    const event = remote().insert({ summary: 'Plan', ...timed(9) });
    await pull();
    rig.test.store.plannerItems.update(titled('Plan').id, rig.ann, {
      title: 'Plan v2',
      notes: 'agenda',
    });
    rig.google.requests.length = 0;
    const first = await pull();
    const patch = rig.google.requests.find((request) => request.method === 'PATCH');
    expect(patch?.ifMatch).toBe(event['etag']);
    expect(remote().get(String(event['id']))).toMatchObject({
      summary: 'Plan v2',
      description: 'agenda',
    });
    const second = await pull();
    expect(first.counts().pushed).toBe(1);
    expect(second.counts()).toMatchObject({ pushed: 0, updated: 0, created: 0 });
    expect(rig.google.requests.filter((request) => request.method === 'PATCH')).toHaveLength(1);
  });

  it('inserts a local event with a deterministic id, its own id as a private property and no duplicate on repeat', async () => {
    await pull();
    const created = localEvent('Dentist');
    await pull();
    const stored = titled('Dentist');
    expect(stored.google).toMatchObject({ state: 'synced' });
    const events = remote()
      .snapshot()
      .filter((event) => event['summary'] === 'Dentist');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: stored.google?.id,
      extendedProperties: { private: { smarteverythingId: created.id } },
    });
    await pull();
    await pull();
    expect(
      remote()
        .snapshot()
        .filter((event) => event['summary'] === 'Dentist'),
    ).toHaveLength(1);
    expect(items()).toHaveLength(1);
  });

  it('adopts an insert whose answer was lost: same id answers 409 and nothing is duplicated', async () => {
    await pull();
    const created = localEvent('Dentist');
    rig.google.faults.fail({ times: 1, status: 503, method: 'POST', pathIncludes: '/events' });
    await expect(pull()).rejects.toMatchObject({ failure: { kind: 'unavailable' } });
    expect(titled('Dentist').google).toMatchObject({ state: 'sending', etag: null });
    const id = titled('Dentist').google?.id ?? '';
    remote().insert({
      id,
      summary: 'Dentist',
      ...timed(10, 12),
      extendedProperties: { private: { smarteverythingId: created.id } },
    });
    await pull();
    expect(titled('Dentist').google).toMatchObject({ state: 'synced' });
    expect(
      remote()
        .snapshot()
        .filter((event) => event['summary'] === 'Dentist'),
    ).toHaveLength(1);
  });

  it('keeps reminders beyond Google five locally and gives them back after a pull', async () => {
    await pull();
    localEvent('Busy', {
      reminders: [1, 2, 3, 4, 5, 6, 7].map((minutes) => ({ minutes_before: minutes })),
    });
    await pull();
    const id = titled('Busy').google?.id ?? '';
    expect(remote().get(id)['reminders']).toStrictEqual({
      useDefault: false,
      overrides: [1, 2, 3, 4, 5].map((minutes) => ({ method: 'popup', minutes })),
    });
    remote().patch(id, { summary: 'Busy v2' }, null);
    await pull();
    expect(titled('Busy v2').reminders).toHaveLength(7);
  });

  it('never writes to a reader calendar or to birthday, focus time and similar events', async () => {
    rig = await build([{ id: 'holidays', summary: 'Holidays', accessRole: 'reader' }]);
    remote('holidays').insert({
      summary: 'Holiday',
      start: { date: '2026-12-25' },
      end: { date: '2026-12-26' },
    });
    remote().insert({
      summary: 'Birthday',
      eventType: 'birthday',
      start: { date: '2026-11-30' },
      end: { date: '2026-12-01' },
    });
    await pull();
    for (const item of items())
      rig.test.store.plannerItems.update(item.id, rig.ann, { title: `${item.title} edited` });
    rig.google.requests.length = 0;
    await pull();
    expect(
      rig.google.requests.filter(
        (request) => request.method !== 'GET' && !request.path.includes('token'),
      ),
    ).toHaveLength(0);
  });

  it('deletes remotely when the item is deleted locally and forgets the tombstone', async () => {
    const event = remote().insert({ summary: 'Old', ...timed(9) });
    await pull();
    rig.test.store.plannerItems.trash(titled('Old').id, rig.ann);
    await pull();
    expect(
      remote()
        .snapshot()
        .find((entry) => entry['id'] === event['id']),
    ).toMatchObject({ status: 'cancelled' });
    expect(rig.test.store.plannerItems.trashed(rig.ann)).toHaveLength(0);
    await pull();
    expect(items()).toHaveLength(0);
  });

  it('brings an item back when a local delete meets a newer remote edit', async () => {
    const event = remote().insert({ summary: 'Contested', ...timed(9) });
    await pull();
    rig.test.store.plannerItems.trash(titled('Contested').id, rig.ann);
    remote().patch(String(event['id']), { summary: 'Contested remote' }, null);
    const run = await pull();
    expect(titled('Contested remote').google).toMatchObject({ state: 'synced' });
    expect(run.conflicts).toMatchObject([{ field: 'deleted', winner: 'google' }]);
  });

  it('writes an EXDATE and an exception for a repeating series and edits only the chosen one', async () => {
    await pull();
    const master = localEvent('Run', { rrule: 'FREQ=DAILY;COUNT=5' });
    await pull();
    const synced = rig.test.store.plannerItems.byId(master.id, rig.ann);
    editItem(rig.test.store, rig.ann, synced, {
      scope: 'this',
      occurrence_key: '2026-11-13T09:00:00.000Z',
      changes: { title: 'Run long' },
    });
    editItem(rig.test.store, rig.ann, synced, {
      scope: 'this',
      occurrence_key: '2026-11-14T09:00:00.000Z',
      changes: { title: 'Run' },
    });
    rig.test.store.plannerItems.update(master.id, rig.ann, { exdates: ['2026-11-15T10:00:00'] });
    await pull();
    const id = String(synced.google?.id);
    expect(remote().get(id)['recurrence']).toStrictEqual([
      'RRULE:FREQ=DAILY;COUNT=5',
      'EXDATE;TZID=Europe/Berlin:20261115T100000',
    ]);
    expect(remote().get(`${id}_20261113T090000Z`)).toMatchObject({ summary: 'Run long' });
    expect(titled('Run long').google).toMatchObject({ state: 'synced' });
  });
});

describe('conflicts', () => {
  it('applies different fields from both sides and logs the loser of the same field', async () => {
    const event = remote().insert({ summary: 'Both', description: 'one', ...timed(9) });
    await pull();
    const id = titled('Both').id;
    remote().patch(String(event['id']), { summary: 'Both remote', location: 'Room 4' }, null);
    rig.google.clock.advance(60_000);
    rig.test.store.plannerItems.update(id, rig.ann, { title: 'Both local', notes: 'local note' });
    const run = await pull();
    expect(titled('Both local').location).toBe('Room 4');
    expect(titled('Both local').notes).toBe('local note');
    expect(run.conflicts).toStrictEqual([
      { item_id: id, field: 'summary', winner: 'app', losing_value: 'Both remote' },
    ]);
    expect(remote().get(String(event['id']))).toMatchObject({
      summary: 'Both local',
      description: 'local note',
      location: 'Room 4',
    });
    const logged = rig.test.store.googleSyncLog.list(rig.ann)[0];
    expect(logged?.conflicts).toStrictEqual(run.conflicts);
    expect(logged).toMatchObject({ product: 'calendar', trigger: 'manual', error: null });
  });

  it('lets the newer remote edit win a same-field conflict', async () => {
    const event = remote().insert({ summary: 'Race', ...timed(9) });
    await pull();
    rig.test.store.plannerItems.update(titled('Race').id, rig.ann, { title: 'Race local' });
    rig.google.clock.advance(60_000);
    remote().patch(String(event['id']), { summary: 'Race remote' }, null);
    const run = await pull();
    expect(titled('Race remote')).toBeDefined();
    expect(run.conflicts).toMatchObject([
      { field: 'summary', winner: 'google', losing_value: 'Race local' },
    ]);
  });

  it('merges after a 412 caused by an edit made between the pull and the push', async () => {
    const event = remote().insert({ summary: 'Late', ...timed(9) });
    await pull();
    rig.test.store.plannerItems.update(titled('Late').id, rig.ann, { title: 'Late local' });
    let raced = false;
    const inner = rig.google.fetch;
    const racing: typeof inner = async (input, init) => {
      if (init.method === 'PATCH' && !raced) {
        raced = true;
        remote().patch(String(event['id']), { location: 'Hall' }, null);
      }
      return inner(input, init);
    };
    const sync = new GoogleCalendarSync({
      store: rig.test.store,
      tokens: rig.tokens,
      fetch: racing,
      now: (): Date => rig.google.clock.now(),
    });
    await sync.sync(rig.ann, 'manual');
    expect(remote().get(String(event['id']))).toMatchObject({
      summary: 'Late local',
      location: 'Hall',
    });
    expect(titled('Late local').location).toBe('Hall');
  });
});

function expectConverged(id: string, written: ReadonlyMap<string, string>): void {
  const [item, ...rest] = items();
  if (item === undefined) throw new Error('the item vanished');
  const google = remote().get(id);
  expect(rest).toHaveLength(0);
  expect(remote().snapshot()).toHaveLength(1);
  expect(google['summary']).toBe(item.title);
  expect(google['description'] ?? '').toBe(item.notes);
  expect(google['location'] ?? null).toBe(item.location);
  expect(item.notes).toBe(written.get('local-notes') ?? '');
  expect(item.location).toBe(written.get('remote-place') ?? null);
  const titles = ['Base', written.get('local-title'), written.get('remote-title')];
  expect(titles).toContain(item.title);
}

describe('convergence', () => {
  it('converges for random interleavings of local and remote edits without losing or duplicating', async () => {
    const step = fc.constantFrom(
      'local-title',
      'remote-title',
      'local-notes',
      'remote-place',
      'sync',
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 8 }), async (steps) => {
        await rig.test.close();
        rig = await build();
        const event = remote().insert({ summary: 'Base', ...timed(9) });
        await pull();
        const id = String(event['id']);
        const written = new Map<string, string>();
        const edit = (changes: object): void => {
          rig.google.clock.tick();
          rig.test.store.plannerItems.update(items()[0]?.id ?? '', rig.ann, changes);
        };
        const actions: Readonly<Record<string, (value: string) => void>> = {
          'local-title': (value) => {
            edit({ title: value });
          },
          'local-notes': (value) => {
            edit({ notes: value });
          },
          'remote-title': (value) => {
            remote().patch(id, { summary: value }, null);
          },
          'remote-place': (value) => {
            remote().patch(id, { location: value }, null);
          },
        };
        for (const [index, action] of steps.entries()) {
          const value = `v${String(index)}`;
          if (action === 'sync') {
            await pull();
          } else {
            actions[action]?.(value);
            written.set(action, value);
          }
        }
        await pull();
        await pull();
        expectConverged(id, written);
        const settled = await pull();
        expect(settled.counts()).toMatchObject({ pushed: 0, updated: 0, created: 0, deleted: 0 });
      }),
      { numRuns: 15 },
    );
  }, 120_000);
});
