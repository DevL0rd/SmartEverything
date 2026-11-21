import type { PlannerCollectionRow } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { PlannerCollectionInput } from '../../store/repositories/planner-collections';
import type { HostStore } from '../../store/host/host-store';
import { reconcileBirthdays } from '../birthdays/sync';
import { allDayEvent } from '../feeds/all-day-event';
import { holidaysOfYear, type HolidayDay } from '../holidays/rules';

function uidOf(day: HolidayDay): string {
  return `holiday:${day.date}:${day.name}`;
}

function nextPosition(store: HostStore, profileId: string): number {
  return store.plannerCollections
    .list(profileId)
    .reduce((highest, row) => Math.max(highest, row.position + 1), 0);
}

function inserted(
  store: HostStore,
  { input }: { readonly input: Omit<PlannerCollectionInput, 'position'> },
): PlannerCollectionRow {
  return store.plannerCollections.insert({
    ...input,
    position: nextPosition(store, input.profile_id),
  });
}

function clearCollection(store: HostStore, collection: PlannerCollectionRow): void {
  for (const row of store.plannerItems.inCollection(collection.id)) {
    store.plannerItems.purge(row.id, row.profile_id);
  }
}

function reconcileYear(store: HostStore, collection: PlannerCollectionRow, year: number): void {
  const { feed } = collection;
  if (feed?.kind !== 'holidays') return;
  const days = holidaysOfYear(feed.country, feed.state, year);
  const { plannerItems } = store;
  const stored = plannerItems
    .inCollection(collection.id)
    .filter((row) => row.ical_uid?.startsWith(`holiday:${String(year)}-`) === true);
  const wanted = new Set(days.map(uidOf));
  const present = new Set<string>();
  for (const row of stored) {
    if (row.ical_uid !== null && wanted.has(row.ical_uid) && !present.has(row.ical_uid)) {
      present.add(row.ical_uid);
    } else {
      plannerItems.purge(row.id, row.profile_id);
    }
  }
  let position = plannerItems
    .inCollection(collection.id)
    .reduce((highest, row) => Math.max(highest, row.position + 1), 0);
  for (const day of days) {
    if (present.has(uidOf(day))) continue;
    plannerItems.insert(
      allDayEvent({
        profileId: collection.profile_id,
        collectionId: collection.id,
        position,
        uid: uidOf(day),
        title: day.name,
        date: day.date,
        rrule: null,
      }),
    );
    position += 1;
  }
}

export interface HolidayRegionChange {
  readonly collection: PlannerCollectionRow;
  readonly country: string;
  readonly state: string | null;
}

export const PLANNER_FEED_WRITE_UNITS = {
  plannerFeedCollectionInsert: storeUnit(inserted),
  plannerBirthdaysInsert: storeUnit(
    (
      store,
      input: { readonly input: Omit<PlannerCollectionInput, 'position'> },
    ): PlannerCollectionRow => {
      const row = inserted(store, input);
      reconcileBirthdays(store, row);
      return row;
    },
  ),
  plannerBirthdaysReconcile: storeUnit(
    (store, { collection }: { readonly collection: PlannerCollectionRow | null }): void => {
      const collections =
        collection === null ? store.plannerCollections.feeds('birthdays') : [collection];
      for (const each of collections) reconcileBirthdays(store, each);
    },
  ),
  plannerHolidaysRegion: storeUnit(
    (store, { collection, country, state }: HolidayRegionChange): PlannerCollectionRow => {
      clearCollection(store, collection);
      return store.plannerCollections.update(collection.id, collection.profile_id, {
        feed: { kind: 'holidays', country, state },
      });
    },
  ),
  plannerHolidaysYears: storeUnit(
    (
      store,
      {
        collection,
        years,
      }: { readonly collection: PlannerCollectionRow; readonly years: number[] },
    ): void => {
      for (const year of years) reconcileYear(store, collection, year);
    },
  ),
} as const;
