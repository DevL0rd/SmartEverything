import {
  PLANNER_SEARCH_PAGE,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type PlannerSearchPage,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { FeedService } from '../../src/planner/feeds';
import { allDayEvent } from '../../src/planner/feeds/all-day-event';
import { instantsOf } from '../../src/planner/instants';
import { searchPlanner, SEARCH_PAGE_SIZE, type SearchQuery } from '../../src/planner/search';
import type { Caller } from '../../src/server/auth';
import { plannerSearchRoutes } from '../../src/server/handlers/planner-search';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';
import { inProcessCalendars } from '../support/ical';

const NOW_TEXT = '2026-11-14T12:00:00.000Z';
const ZONE = 'Europe/Berlin';

let test: TestStore;
let clock: SimulatedClock;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;
let work: PlannerCollectionRow;
let serial = 0;

beforeEach(async () => {
  clock = new SimulatedClock(NOW_TEXT);
  test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: ZONE });
  owner = addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  work = calendar(ann.profileId, 'Work');
});

afterEach(async () => {
  await test.close();
});

function calendar(
  profileId: string,
  name: string,
  audience: 'personal' | 'household' = 'personal',
): PlannerCollectionRow {
  serial += 1;
  return test.store.plannerCollections.insert({
    profile_id: profileId,
    kind: 'calendar',
    name,
    colour: 'work',
    icon: 'calendar',
    position: serial,
    visible: true,
    default_reminders: [],
    audience,
    source: 'local',
    google: null,
    feed: null,
  });
}

function put(
  collection: PlannerCollectionRow,
  fields: Partial<PlannerItemInput> & { readonly title: string },
): PlannerItemRow {
  serial += 1;
  const timing = {
    start_local: null,
    end_local: null,
    time_zone: null,
    all_day: false,
    rrule: null,
    ...fields,
  };
  return test.store.plannerItems.insert({
    profile_id: collection.profile_id,
    collection_id: collection.id,
    kind: 'event',
    parent_id: null,
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
    position: serial,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    assignee_id: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: 'person',
    ...fields,
    ...timing,
    ...instantsOf(timing),
  });
}

function timed(
  collection: PlannerCollectionRow,
  title: string,
  start: string,
  extra: Partial<PlannerItemInput> = {},
): PlannerItemRow {
  return put(collection, {
    title,
    start_local: start,
    end_local: `${start.slice(0, 11)}${String(Number(start.slice(11, 13)) + 1).padStart(2, '0')}:00`,
    time_zone: ZONE,
    ...extra,
  });
}

const query = (
  person: TestPerson,
  text: string,
  extra: Partial<SearchQuery> = {},
): SearchQuery => ({
  profileId: person.profileId,
  text,
  now: Temporal.Instant.from(NOW_TEXT),
  timeZone: ZONE,
  when: 'all',
  ...extra,
});

const titles = (person: TestPerson, text: string, extra: Partial<SearchQuery> = {}): string[] =>
  searchPlanner(test.store, query(person, text, extra)).hits.map((hit) => hit.occurrence.title);

describe('matching', () => {
  it('finds the title, notes, location, guest and calendar name and says which matched', () => {
    timed(work, 'Dentist', '2026-11-20T09:00', {
      notes: 'bring the x-ray',
      location: 'Elm Street 4',
    });
    const guestEvent = timed(work, 'Lunch', '2026-11-21T12:00');
    test.store.plannerGuests.insert({
      item_id: guestEvent.id,
      kind: 'email',
      profile_id: null,
      email: 'marta@example.org',
      name: 'Marta Kowalski',
      delivery: 'not_sent',
      delivery_detail: null,
      token_hash: 'a'.repeat(64),
    });
    const matched = (text: string): string[] =>
      searchPlanner(test.store, query(ann, text)).hits.flatMap((hit) => hit.matched);
    expect(matched('dentist')).toEqual(['title']);
    expect(matched('x-ray')).toEqual(['notes']);
    expect(matched('elm')).toEqual(['location']);
    expect(matched('kowalski')).toEqual(['guest']);
    expect(matched('marta@example')).toEqual(['guest']);
    expect(titles(ann, 'work')).toEqual(['Dentist', 'Lunch']);
    expect(matched('work')).toEqual(['calendar', 'calendar']);
  });

  it('folds case and accents on both sides', () => {
    timed(work, 'Café Müller', '2026-11-20T09:00');
    expect(titles(ann, 'CAFE')).toEqual(['Café Müller']);
    expect(titles(ann, 'muller')).toEqual(['Café Müller']);
    expect(titles(ann, 'café müller')).toEqual(['Café Müller']);
  });

  it('matches the start of words, not the middle', () => {
    timed(work, 'Doctor visit', '2026-11-20T09:00');
    timed(work, 'Undoctored', '2026-11-21T09:00');
    expect(titles(ann, 'doc')).toEqual(['Doctor visit']);
    expect(titles(ann, 'visit')).toEqual(['Doctor visit']);
  });

  it('needs every word, each found somewhere', () => {
    timed(work, 'Dentist', '2026-11-20T09:00', { location: 'Elm Street' });
    timed(work, 'Dentist', '2026-11-21T09:00', { location: 'Oak Road' });
    expect(searchPlanner(test.store, query(ann, 'dentist elm')).hits).toHaveLength(1);
    expect(titles(ann, 'dentist pine')).toEqual([]);
  });

  it('finds tasks without a date and gives them a hit', () => {
    put(work, { title: 'Sort the cellar', kind: 'task' });
    const page = searchPlanner(test.store, query(ann, 'cellar'));
    expect(page.hits[0]).toMatchObject({
      reading: 'next',
      occurrence: { start: null, due_at: null, due_date: null, status: 'open' },
    });
  });

  it('filters by kind and by calendar', () => {
    const home = calendar(ann.profileId, 'Home');
    timed(work, 'Plan trip', '2026-11-20T09:00');
    put(home, { title: 'Plan menu', kind: 'task', due_date: '2026-11-22' });
    expect(titles(ann, 'plan', { kinds: ['task'] })).toEqual(['Plan menu']);
    expect(titles(ann, 'plan', { kinds: ['event'] })).toEqual(['Plan trip']);
    expect(titles(ann, 'plan', { kinds: ['event', 'task'] })).toHaveLength(2);
    expect(titles(ann, 'plan', { collectionIds: [home.id] })).toEqual(['Plan menu']);
  });
});

describe('the occurrence of a hit', () => {
  it('shows the next one of a repeat and the last one when it is over', () => {
    timed(work, 'Standup', '2026-10-05T09:00', { rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    timed(work, 'Retro', '2026-09-07T09:00', {
      rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261013T000000Z',
    });
    const hits = searchPlanner(test.store, query(ann, 'standup retro')).hits;
    expect(hits).toHaveLength(0);
    const standup = searchPlanner(test.store, query(ann, 'standup')).hits[0];
    expect(standup).toMatchObject({ reading: 'next' });
    expect(standup?.occurrence.start).toBe('2026-11-16T08:00:00.000Z');
    const retro = searchPlanner(test.store, query(ann, 'retro')).hits[0];
    expect(retro).toMatchObject({ reading: 'last' });
    expect(retro?.occurrence.start).toBe('2026-10-12T07:00:00.000Z');
  });

  it('counts an event that is going on as upcoming', () => {
    timed(work, 'Workshop', '2026-11-14T12:00', { end_local: '2026-11-14T14:00' });
    const hit = searchPlanner(test.store, query(ann, 'workshop')).hits[0];
    expect(hit?.reading).toBe('next');
  });

  it('counts an all-day event of today as upcoming and of yesterday as past', () => {
    const today = put(work, {
      ...allDayEvent({
        profileId: ann.profileId,
        collectionId: work.id,
        position: 1,
        uid: 'a',
        title: 'Fair today',
        date: '2026-11-14',
        rrule: null,
      }),
    });
    put(work, {
      ...allDayEvent({
        profileId: ann.profileId,
        collectionId: work.id,
        position: 2,
        uid: 'b',
        title: 'Fair yesterday',
        date: '2026-11-13',
        rrule: null,
      }),
    });
    expect(today.all_day).toBe(true);
    const hits = searchPlanner(test.store, query(ann, 'fair')).hits;
    expect(hits.map((hit) => `${hit.occurrence.title}:${hit.reading}`)).toEqual([
      'Fair today:next',
      'Fair yesterday:last',
    ]);
  });

  it('answers the when filter with what is ahead or behind', () => {
    timed(work, 'Review', '2026-11-20T09:00');
    timed(work, 'Review', '2026-11-01T09:00');
    timed(work, 'Review', '2026-10-01T09:00', { rrule: 'FREQ=WEEKLY;BYDAY=TH' });
    const readings = (when: 'all' | 'upcoming' | 'past'): string[] =>
      searchPlanner(test.store, query(ann, 'review', { when })).hits.map(
        (hit) => `${hit.reading}:${hit.occurrence.start?.slice(0, 10) ?? ''}`,
      );
    expect(readings('upcoming')).toEqual(['next:2026-11-19', 'next:2026-11-20']);
    expect(readings('past')).toEqual(['last:2026-11-12', 'last:2026-11-01']);
    expect(readings('all')).toEqual(['next:2026-11-19', 'next:2026-11-20', 'last:2026-11-01']);
  });
});

describe('the order', () => {
  it('lists what is ahead by start, then tasks without a date, then the past by most recent', () => {
    timed(work, 'Plan later', '2026-12-01T09:00');
    timed(work, 'Plan old', '2026-09-01T09:00');
    put(work, { title: 'Plan undated', kind: 'task' });
    timed(work, 'Plan soon', '2026-11-15T09:00');
    timed(work, 'Plan recent', '2026-11-10T09:00');
    expect(titles(ann, 'plan')).toEqual([
      'Plan soon',
      'Plan later',
      'Plan undated',
      'Plan recent',
      'Plan old',
    ]);
  });

  it('pages with a cursor without repeating or skipping a hit', () => {
    for (let index = 0; index < 120; index += 1) {
      const day = String(1 + (index % 28)).padStart(2, '0');
      timed(
        work,
        `Visit ${String(index)}`,
        `2027-0${String(1 + Math.floor(index / 28))}-${day}T09:00`,
      );
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page: PlannerSearchPage = PLANNER_SEARCH_PAGE.parse(
        searchPlanner(test.store, query(ann, 'visit', { cursor })),
      );
      expect(page.hits.length).toBeLessThanOrEqual(SEARCH_PAGE_SIZE);
      seen.push(...page.hits.map((hit) => hit.occurrence.title));
      cursor = page.next ?? undefined;
      pages += 1;
    } while (cursor !== undefined);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(120);
    const starts = seen.map((title) => Number(title.slice(6)));
    expect(starts).toHaveLength(120);
  });

  it('refuses a cursor it did not make', () => {
    timed(work, 'Visit', '2026-11-20T09:00');
    expect(() => searchPlanner(test.store, query(ann, 'visit', { cursor: 'bogus' }))).toThrow(
      expect.objectContaining({ code: 'invalid_request' }),
    );
  });
});

describe('who may find what', () => {
  it('keeps another person calendar out', () => {
    timed(work, 'Secret plan', '2026-11-20T09:00');
    expect(titles(bob, 'secret')).toEqual([]);
    expect(titles(ann, 'secret')).toEqual(['Secret plan']);
  });

  it('finds the family calendar for everyone', () => {
    const family = calendar(ann.profileId, 'Family', 'household');
    timed(family, 'Picnic', '2026-11-20T09:00');
    expect(titles(bob, 'picnic')).toEqual(['Picnic']);
    expect(titles(bob, 'family')).toEqual(['Picnic']);
  });

  it('finds a shared calendar by its items and by its name', () => {
    timed(work, 'Budget talk', '2026-11-20T09:00');
    test.store.plannerShares.save({
      collection_id: work.id,
      profile_id: bob.profileId,
      role: 'view',
    });
    expect(titles(bob, 'budget')).toEqual(['Budget talk']);
    expect(titles(bob, 'work')).toEqual(['Budget talk']);
  });

  it('finds an event the person is a guest of, even declined, but not its calendar name', () => {
    const event = timed(work, 'Birthday dinner', '2026-11-20T18:00');
    const guest = test.store.plannerGuests.insert({
      item_id: event.id,
      kind: 'person',
      profile_id: bob.profileId,
      email: null,
      name: null,
      delivery: 'not_sent',
      delivery_detail: null,
      token_hash: null,
    });
    expect(titles(bob, 'dinner')).toEqual(['Birthday dinner']);
    expect(titles(bob, 'work')).toEqual([]);
    test.store.plannerGuests.update(guest.id, {
      response: 'no',
      responded_at: NOW_TEXT,
    });
    expect(titles(bob, 'dinner')).toEqual(['Birthday dinner']);
    expect(titles(ann, 'bob')).toEqual(['Birthday dinner']);
  });

  it('finds a task assigned to the person but not one assigned to somebody else', () => {
    const family = calendar(owner.profileId, 'Family', 'household');
    put(family, { title: 'Wash the car', kind: 'task', assignee_id: bob.profileId });
    put(family, { title: 'Wash the dog', kind: 'task', assignee_id: ann.profileId });
    expect(titles(bob, 'wash')).toEqual(['Wash the car']);
    expect(titles(ann, 'wash')).toEqual(['Wash the dog']);
    expect(titles(owner, 'wash')).toEqual(['Wash the car', 'Wash the dog']);
    expect(titles(addPerson(test, 'Cy', 'member'), 'wash')).toEqual([]);
  });

  it('hides what was deleted and the steps of a task', () => {
    const gone = timed(work, 'Dance class', '2026-11-20T09:00');
    test.store.plannerItems.trash(gone.id, ann.profileId);
    const parent = put(work, { title: 'Pack', kind: 'task' });
    put(work, { title: 'Pack socks', kind: 'task', parent_id: parent.id });
    expect(titles(ann, 'dance')).toEqual([]);
    expect(titles(ann, 'pack')).toEqual(['Pack']);
  });
});

describe('the search route', () => {
  it('writes the holidays around today first and finds them', async () => {
    const service = new FeedService({
      store: test.store,
      clock,
      calendars: inProcessCalendars,
      log: testLogger('feeds'),
    });
    await service.registry.of('holidays').create({
      profileId: ann.profileId,
      input: { kind: 'holidays', country: 'DE', state: null },
    });
    const route = plannerSearchRoutes(
      { store: test.store },
      {
        now: () => clock.now(),
        feeds: service,
      },
    ).readPlannerSearch;
    const caller: Caller = { kind: 'client', client: ann.client };
    const search = (text: string): Promise<unknown> =>
      route.run(
        caller,
        { params: {}, query: { text, when: 'all' }, body: undefined, remote: 'test', headers: {} },
        testLogger(),
      );
    const page = PLANNER_SEARCH_PAGE.parse(await search('christmas'));
    expect(
      page.hits.map((hit) => `${hit.reading}:${hit.occurrence.start?.slice(0, 10) ?? ''}`),
    ).toEqual(['next:2026-12-25']);
    expect(page.hits[0]?.matched).toEqual(['title']);
    clock.advanceTo('2026-12-30T12:00:00.000Z');
    const later = PLANNER_SEARCH_PAGE.parse(await search('christmas'));
    expect(
      later.hits.map((hit) => `${hit.reading}:${hit.occurrence.start?.slice(0, 10) ?? ''}`),
    ).toEqual(['next:2027-12-25']);
  });
});
