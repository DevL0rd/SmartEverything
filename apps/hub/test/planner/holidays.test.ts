import type { IncomingHttpHeaders } from 'node:http';
import {
  PLANNER_DAY,
  PLANNER_HOLIDAY_REGION,
  PLANNER_PREFERENCES,
  PLANNER_RANGE,
  type PlannerCollectionRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { FeedService } from '../../src/planner/feeds';
import { holidaysOfYear, holidayRegions } from '../../src/planner/holidays/rules';
import { composeRange } from '../../src/planner/range';
import type { Caller } from '../../src/server/auth';
import { plannerCoreRoutes } from '../../src/server/handlers/planner';
import { testLogger } from '../support/logs';
import { addPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';
import { inProcessCalendars } from '../support/ical';

const START = '2026-11-14T12:00:00.000Z';

let test: TestStore;
let service: FeedService;
let ownerId: string;

beforeEach(async () => {
  const clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: 'Europe/Berlin' });
  const owner = test.store.profiles.list()[0];
  if (owner === undefined) throw new Error('the store has no owner');
  ownerId = owner.id;
  service = new FeedService({
    store: test.store,
    clock,
    calendars: inProcessCalendars,
    log: testLogger('feeds'),
  });
});

afterEach(async () => {
  await test.close();
});

const create = (country: string, state: string | null = null): Promise<PlannerCollectionRow> =>
  service.registry.of('holidays').create({
    profileId: ownerId,
    input: { kind: 'holidays', country, state },
  });

const prepare = (collection: PlannerCollectionRow, from: string, to: string): Promise<void> =>
  service.registry.prepare([collection], { from, to });

const rows = (collection: PlannerCollectionRow): { date: string; title: string }[] =>
  test.store.plannerItems
    .inCollection(collection.id)
    .map((item) => ({ date: item.start_local ?? '', title: item.title }))
    .sort((a, b) => a.date.localeCompare(b.date));

const datesOf = (collection: PlannerCollectionRow): string[] =>
  rows(collection).map((row) => row.date);

describe('holiday regions', () => {
  it('lists every country with its regions, sorted by name', () => {
    const regions = holidayRegions();
    expect(regions.length).toBeGreaterThan(150);
    for (const region of regions) PLANNER_HOLIDAY_REGION.parse(region);
    const names = regions.map((region) => region.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const germany = regions.find((region) => region.country === 'DE');
    expect(germany?.states.map((state) => state.code)).toContain('BY');
    const britain = regions.find((region) => region.country === 'GB');
    expect(britain?.states.map((state) => state.code)).toEqual(
      expect.arrayContaining(['ENG', 'SCT', 'WLS', 'NIR']),
    );
  });

  it('knows regions that differ in their days', () => {
    const bavaria = holidaysOfYear('DE', 'BY', 2026).map((day) => day.date);
    const berlin = holidaysOfYear('DE', 'BE', 2026).map((day) => day.date);
    expect(bavaria).toContain('2026-01-06');
    expect(berlin).not.toContain('2026-01-06');
    expect(berlin).toContain('2026-03-08');
    expect(bavaria).not.toContain('2026-03-08');
  });

  it('keeps public days only', () => {
    const days = holidaysOfYear('GB', 'ENG', 2026).map((day) => day.name);
    expect(days).toContain('Good Friday');
    expect(days).not.toContain('Easter Sunday');
    expect(days).not.toContain('Mother’s Day');
  });
});

describe('creating a holidays calendar', () => {
  it('adds a read-only feed calendar named after the region', async () => {
    const collection = await create('DE', 'BY');
    expect(collection).toMatchObject({
      kind: 'calendar',
      source: 'feed',
      feed: { kind: 'holidays', country: 'DE', state: 'BY' },
    });
    expect(collection.name).toContain('Germany');
    expect(rows(collection)).toEqual([]);
  });

  it('refuses a country or region that has no calendar', async () => {
    await expect(create('ZZ')).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(create('DE', 'XX')).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('refuses an address or a refresh time', async () => {
    const collection = await create('DE');
    await expect(
      service.registry.of('holidays').update(collection, { refresh_minutes: 5 }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('writing years when a read reaches them', () => {
  it('writes only the years the window covers', async () => {
    const collection = await create('DE', 'BY');
    await prepare(collection, '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');
    expect(datesOf(collection).every((date) => date.startsWith('2026-'))).toBe(true);
    expect(datesOf(collection)).toContain('2026-12-25');
    await prepare(collection, '2028-06-01T00:00:00.000Z', '2028-06-02T00:00:00.000Z');
    const years = new Set(datesOf(collection).map((date) => date.slice(0, 4)));
    expect([...years].sort()).toEqual(['2026', '2028']);
  });

  it('writes each year once and keeps its rows on later reads', async () => {
    const collection = await create('US');
    await prepare(collection, '2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z');
    const before = test.store.plannerItems.inCollection(collection.id).map((item) => item.id);
    await prepare(collection, '2026-03-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
    const after = test.store.plannerItems.inCollection(collection.id).map((item) => item.id);
    expect(after).toEqual(before);
    expect(before.length).toBeGreaterThan(8);
  });

  it('finds the rows it wrote earlier after a restart without writing them twice', async () => {
    const collection = await create('US');
    await prepare(collection, '2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z');
    const restarted = new FeedService({
      store: test.store,
      clock: new SimulatedClock(START),
      calendars: inProcessCalendars,
      log: testLogger('feeds'),
    });
    await restarted.registry.prepare([collection], {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    });
    const names = rows(collection).map((row) => `${row.date}${row.title}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers a window that crosses a new year', async () => {
    const collection = await create('DE');
    await prepare(collection, '2026-12-30T00:00:00.000Z', '2027-01-03T00:00:00.000Z');
    expect(datesOf(collection)).toEqual(expect.arrayContaining(['2026-12-25', '2027-01-01']));
  });

  it('writes all-day events made by the feed', async () => {
    const collection = await create('DE');
    await prepare(collection, '2026-12-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z');
    const christmas = test.store.plannerItems
      .inCollection(collection.id)
      .find((item) => item.start_local === '2026-12-25');
    expect(christmas).toMatchObject({
      kind: 'event',
      all_day: true,
      time_zone: null,
      created_by: 'feed',
      rrule: null,
      profile_id: ownerId,
    });
  });

  it('shows the days in a range read', async () => {
    const collection = await create('DE', 'BY');
    await prepare(collection, '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    const range = composeRange(test.store, {
      profileId: ownerId,
      window: {
        from: Temporal.Instant.from('2026-12-24T00:00:00Z'),
        to: Temporal.Instant.from('2026-12-27T00:00:00Z'),
        timeZone: 'Europe/Berlin',
      },
      now: Temporal.Instant.from(START),
    });
    expect(range.occurrences.map((view) => view.start?.slice(0, 10))).toEqual([
      '2026-12-25',
      '2026-12-26',
    ]);
    expect(range.occurrences.every((view) => view.all_day)).toBe(true);
  });
});

describe('changing the region', () => {
  it('replaces the days with those of the new region', async () => {
    const collection = await create('DE', 'BY');
    await prepare(collection, '2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z');
    expect(datesOf(collection)).toContain('2026-01-06');
    const moved = await service.registry.of('holidays').update(collection, { state: 'BE' });
    expect(moved.feed).toEqual({ kind: 'holidays', country: 'DE', state: 'BE' });
    expect(rows(moved)).toEqual([]);
    await prepare(moved, '2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z');
    expect(datesOf(moved)).not.toContain('2026-01-06');
    expect(datesOf(moved)).toContain('2026-03-08');
  });

  it('writes again after going back to an earlier region', async () => {
    const collection = await create('DE', 'BY');
    const window = { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' };
    await service.registry.prepare([collection], window);
    const handler = service.registry.of('holidays');
    const there = await handler.update(collection, { state: 'BE' });
    await service.registry.prepare([there], window);
    const back = await handler.update(there, { state: 'BY' });
    await service.registry.prepare([back], window);
    expect(datesOf(back)).toContain('2026-01-06');
  });
});

describe('the day and range reads', () => {
  it('write the year they reach before they answer', async () => {
    const person = addPerson(test, 'Ann', 'member');
    const collection = await service.registry.of('holidays').create({
      profileId: person.profileId,
      input: { kind: 'holidays', country: 'DE', state: null },
    });
    const preferences = PLANNER_PREFERENCES.parse({
      general: {
        week_start: 1,
        day_start: '07:00',
        day_end: '22:00',
        working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
        shown_profile_id: null,
      },
      day_planner: {
        fade: 'soft',
        show_happened: true,
        show_sleep: true,
        show_weather: true,
        missed_scope: 'today',
      },
      tasks: { default_collection_id: null, smart_lists: ['today'], suggest_completion: true },
      calendar: {
        default_view: 'week',
        default_reminders: [],
        show_tasks: true,
        show_alarms: true,
        show_sleep: true,
        show_free_time: true,
      },
      clock: {
        sound: { kind: 'tone', id: 'sunrise' },
        ramp_seconds: 0,
        snooze_minutes: 9,
        snooze_limit: null,
        targets: [],
        wake_automation_id: null,
        world_clocks: [],
      },
      bedtime: {
        enabled: false,
        schedule: [],
        reminder_minutes: 30,
        wind_down_minutes: 30,
        wind_down_automation_id: null,
        do_not_disturb: true,
        sleep_sound: null,
      },
      sleep_sounds: { sound: null, timer_minutes: null, fade_seconds: 0 },
      watch: { watch_alarm_sync: false, watch_calendar_push: false },
      ai: { briefing: 'off', evening_review: false, plan_suggestions: false },
    });
    const core = plannerCoreRoutes(
      { store: test.store },
      {
        now: () => new Date(START),
        preferencesOf: () => preferences,
        catalogueOf: () => {
          throw new Error('no catalogue');
        },
        feeds: service,
      },
    );
    const caller: Caller = { kind: 'client', client: person.client };
    const raw = (
      query: object,
    ): {
      params: object;
      query: object;
      body: undefined;
      remote: string;
      headers: IncomingHttpHeaders;
    } => ({
      params: {},
      query,
      body: undefined,
      remote: 'test',
      headers: {},
    });
    expect(rows(collection)).toEqual([]);
    const day = PLANNER_DAY.parse(
      await core.readPlannerDay.run(caller, raw({ date: '2026-12-25' }), testLogger()),
    );
    expect(day.upcoming.map((view) => view.title)).toEqual(['Christmas Day']);
    expect(datesOf(collection).every((date) => date.startsWith('2026-'))).toBe(true);
    const range = PLANNER_RANGE.parse(
      await core.readPlannerRange.run(
        caller,
        raw({ from: '2027-12-24T00:00:00.000Z', to: '2027-12-27T00:00:00.000Z' }),
        testLogger(),
      ),
    );
    expect(range.occurrences).toHaveLength(2);
    expect(datesOf(collection)).toContain('2027-12-25');
  });
});
