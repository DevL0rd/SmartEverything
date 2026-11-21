import type { PlannerCollectionRow, PlannerItemRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { allDayEvent } from '../../src/planner/feeds/all-day-event';
import { FeedService } from '../../src/planner/feeds';
import { composeRange } from '../../src/planner/range';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { inProcessCalendars } from '../support/ical';

const START = '2026-11-14T12:00:00.000Z';

let test: TestStore;
let service: FeedService;
let ownerId: string;
let annId: string;

beforeEach(async () => {
  const clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  test.store.settings.updateHome({ time_zone: 'Europe/Berlin' });
  const owner = test.store.profiles.list()[0];
  if (owner === undefined) throw new Error('the store has no owner');
  ownerId = owner.id;
  test.store.profiles.update(ownerId, { name: 'Sam', birth_date: '1984-03-04' });
  annId = test.store.profiles.create({ name: 'Ann', birth_date: '1990-07-21' }).id;
  service = new FeedService({
    store: test.store,
    clock,
    calendars: inProcessCalendars,
    log: testLogger('feeds'),
  });
  service.start();
});

afterEach(async () => {
  service.stop();
  await test.close();
});

const create = (): Promise<PlannerCollectionRow> =>
  service.registry.of('birthdays').create({
    profileId: ownerId,
    input: { kind: 'birthdays' },
  });

const items = (collection: PlannerCollectionRow): PlannerItemRow[] =>
  test.store.plannerItems.inCollection(collection.id);

const titles = (collection: PlannerCollectionRow): string[] =>
  items(collection)
    .map((item) => item.title)
    .sort();

const on = (collection: PlannerCollectionRow, from: string, to: string): string[] =>
  composeRange(test.store, {
    profileId: ownerId,
    window: {
      from: Temporal.Instant.from(from),
      to: Temporal.Instant.from(to),
      timeZone: 'Europe/Berlin',
    },
    now: Temporal.Instant.from(START),
    collectionIds: [collection.id],
  }).occurrences.map((view) => `${view.start?.slice(0, 10) ?? ''} ${view.title}`);

describe('the birthdays calendar', () => {
  it('holds one yearly all-day item per profile with a birth date', async () => {
    test.store.profiles.create({ name: 'Cat' });
    await service.settled();
    const collection = await create();
    expect(collection).toMatchObject({ source: 'feed', feed: { kind: 'birthdays' } });
    expect(titles(collection)).toEqual(['Ann’s birthday', 'Sam’s birthday']);
    expect(items(collection).map((item) => item.created_by)).toEqual(['feed', 'feed']);
    const sam = items(collection).find((item) => item.title === 'Sam’s birthday');
    expect(sam).toMatchObject({
      kind: 'event',
      all_day: true,
      start_local: '1984-03-04',
      rrule: 'FREQ=YEARLY',
      time_zone: null,
      profile_id: ownerId,
    });
  });

  it('repeats on the day every year', async () => {
    const collection = await create();
    expect(on(collection, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')).toEqual([
      '2026-03-04 Sam’s birthday',
    ]);
    expect(on(collection, '2031-07-01T00:00:00Z', '2031-08-01T00:00:00Z')).toEqual([
      '2031-07-21 Ann’s birthday',
    ]);
  });

  it('keeps a leap day birthday on the last day of February every year', async () => {
    test.store.profiles.update(annId, { birth_date: '1992-02-29' });
    await service.settled();
    const collection = await create();
    expect(on(collection, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z')).toEqual([
      '2027-02-28 Ann’s birthday',
    ]);
    expect(on(collection, '2028-02-01T00:00:00Z', '2028-03-01T00:00:00Z')).toEqual([
      '2028-02-29 Ann’s birthday',
    ]);
  });

  it('says My birthday for the profile named Me', async () => {
    test.store.profiles.update(ownerId, { name: 'Me' });
    await service.settled();
    const collection = await create();
    expect(titles(collection)).toContain('My birthday');
  });

  it('follows a birth date, a name, a new profile and a removed profile', async () => {
    const collection = await create();
    test.store.profiles.update(annId, { birth_date: '1991-08-02', name: 'Annie' });
    await service.settled();
    expect(titles(collection)).toEqual(['Annie’s birthday', 'Sam’s birthday']);
    expect(items(collection).find((item) => item.title.startsWith('Annie'))?.start_local).toBe(
      '1991-08-02',
    );
    const catId = test.store.profiles.create({ name: 'Cat', birth_date: '2015-01-09' }).id;
    await service.settled();
    expect(titles(collection)).toEqual(['Annie’s birthday', 'Cat’s birthday', 'Sam’s birthday']);
    test.store.profiles.update(catId, { birth_date: null });
    await service.settled();
    expect(titles(collection)).toEqual(['Annie’s birthday', 'Sam’s birthday']);
    test.store.profiles.remove(annId);
    await service.settled();
    expect(titles(collection)).toEqual(['Sam’s birthday']);
  });

  it('writes nothing when nothing about a birthday changed', async () => {
    const collection = await create();
    const tables: string[] = [];
    const stop = test.store.feed.subscribe((change) => {
      tables.push(change.table);
    });
    test.store.profiles.update(annId, { height_cm: 170 });
    await service.settled();
    stop();
    expect(tables).toEqual(['profiles']);
    expect(items(collection)).toHaveLength(2);
  });

  it('catches up on a read when no change was heard', async () => {
    const collection = await create();
    service.stop();
    test.store.profiles.update(annId, { birth_date: '1991-08-02' });
    await service.settled();
    expect(items(collection).find((item) => item.title === 'Ann’s birthday')?.start_local).toBe(
      '1990-07-21',
    );
    await service.registry.prepare([collection], {
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-12-01T00:00:00.000Z',
    });
    expect(items(collection).find((item) => item.title === 'Ann’s birthday')?.start_local).toBe(
      '1991-08-02',
    );
  });

  it('leaves a birthday added by hand alone', async () => {
    const collection = await create();
    const added = test.store.plannerItems.insert({
      ...allDayEvent({
        profileId: ownerId,
        collectionId: collection.id,
        position: 9,
        uid: 'by-hand',
        title: 'Grandma’s birthday',
        date: '1950-12-01',
        rrule: 'FREQ=YEARLY',
      }),
      ical_uid: null,
      created_by: 'person',
    });
    test.store.profiles.update(annId, { birth_date: null });
    await service.settled();
    expect(titles(collection)).toEqual(['Grandma’s birthday', 'Sam’s birthday']);
    expect(on(collection, '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z')).toEqual([
      '2026-12-01 Grandma’s birthday',
    ]);
    expect(test.store.plannerItems.find(added.id, ownerId)).toBeDefined();
  });

  it('refuses changes to a birthdays calendar', async () => {
    const collection = await create();
    await expect(
      service.registry.of('birthdays').update(collection, { refresh_minutes: 60 }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(collection.feed).toEqual({ kind: 'birthdays' });
  });
});
