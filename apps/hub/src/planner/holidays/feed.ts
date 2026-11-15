import { ApiError, type PlannerCollectionRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { allDayEvent } from '../feeds/all-day-event';
import { settled } from '../feeds/settled';
import type {
  FeedCreateRequest,
  FeedKindHandler,
  FeedWindow,
  PlannerFeedChanges,
} from '../feeds/registry';
import {
  HolidayRegionError,
  assertHolidayRegion,
  holidaysOfYear,
  regionName,
  type HolidayDay,
} from './rules';

export type HolidayFeedStore = Pick<Store, 'write' | 'plannerCollections' | 'plannerItems'>;

interface Written {
  signature: string;
  readonly years: Set<number>;
}

const DAY_MS = 86_400_000;

function refused(cause: unknown): never {
  if (cause instanceof HolidayRegionError) throw new ApiError('invalid_request', cause.message);
  throw cause;
}

function uidOf(day: HolidayDay): string {
  return `holiday:${day.date}:${day.name}`;
}

export function yearsOf(window: FeedWindow): number[] {
  const first = new Date(Date.parse(window.from) - DAY_MS).getUTCFullYear();
  const last = new Date(Date.parse(window.to) + DAY_MS).getUTCFullYear();
  return Array.from({ length: Math.max(last - first + 1, 0) }, (_, index) => first + index);
}

export class HolidaysFeedKind implements FeedKindHandler {
  readonly kind = 'holidays';
  private readonly written = new Map<string, Written>();

  constructor(private readonly store: HolidayFeedStore) {}

  create(request: FeedCreateRequest): Promise<PlannerCollectionRow> {
    return settled(() => this.created(request));
  }

  private created(request: FeedCreateRequest): PlannerCollectionRow {
    const { input, profileId } = request;
    if (input.kind !== 'holidays') throw new ApiError('invalid_request', 'This is not holidays.');
    try {
      assertHolidayRegion(input.country, input.state);
    } catch (cause) {
      refused(cause);
    }
    const position = this.store.plannerCollections
      .list(profileId)
      .reduce((highest, row) => Math.max(highest, row.position + 1), 0);
    return this.store.plannerCollections.insert({
      profile_id: profileId,
      kind: 'calendar',
      name: input.name ?? `Holidays, ${regionName(input.country, input.state)}`,
      colour: input.colour ?? 'family',
      icon: 'calendar',
      position,
      visible: true,
      default_reminders: [],
      audience: 'personal',
      source: 'feed',
      google: null,
      feed: { kind: 'holidays', country: input.country, state: input.state },
    });
  }

  update(
    collection: PlannerCollectionRow,
    changes: PlannerFeedChanges,
  ): Promise<PlannerCollectionRow> {
    return settled(() => this.changed(collection, changes));
  }

  private changed(
    collection: PlannerCollectionRow,
    changes: PlannerFeedChanges,
  ): PlannerCollectionRow {
    const { feed } = collection;
    if (feed?.kind !== 'holidays') {
      throw new ApiError('invalid_request', 'This is not a holidays calendar.');
    }
    if (changes.url !== undefined || changes.refresh_minutes !== undefined) {
      throw new ApiError('invalid_request', 'A holidays calendar has a country, not an address.');
    }
    const country = changes.country ?? feed.country;
    const state = changes.state === undefined ? feed.state : changes.state;
    try {
      assertHolidayRegion(country, state);
    } catch (cause) {
      refused(cause);
    }
    if (country === feed.country && state === feed.state) return collection;
    return this.store.write(() => {
      this.clear(collection);
      return this.store.plannerCollections.update(collection.id, collection.profile_id, {
        feed: { kind: 'holidays', country, state },
      });
    });
  }

  refresh(collection: PlannerCollectionRow): Promise<PlannerCollectionRow> {
    return settled(() => {
      if (collection.feed?.kind !== 'holidays') {
        throw new ApiError('invalid_request', 'This is not a holidays calendar.');
      }
      this.written.delete(collection.id);
      return collection;
    });
  }

  prepare(collection: PlannerCollectionRow, window: FeedWindow): void {
    const { feed } = collection;
    if (feed?.kind !== 'holidays') return;
    const signature = `${feed.country}|${feed.state ?? ''}`;
    const known = this.written.get(collection.id);
    const memory = known?.signature === signature ? known : { signature, years: new Set<number>() };
    this.written.set(collection.id, memory);
    const missing = yearsOf(window).filter((year) => !memory.years.has(year));
    if (missing.length === 0) return;
    this.store.write(() => {
      for (const year of missing) {
        this.reconcile(collection, holidaysOfYear(feed.country, feed.state, year), year);
      }
    });
    for (const year of missing) memory.years.add(year);
  }

  private clear(collection: PlannerCollectionRow): void {
    this.written.delete(collection.id);
    for (const row of this.store.plannerItems.inCollection(collection.id)) {
      this.store.plannerItems.purge(row.id, row.profile_id);
    }
  }

  private reconcile(
    collection: PlannerCollectionRow,
    days: readonly HolidayDay[],
    year: number,
  ): void {
    const { plannerItems } = this.store;
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
}
