import { ApiError, type PlannerCollectionRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { settled } from '../feeds/settled';
import type {
  FeedCreateRequest,
  FeedKindHandler,
  FeedWindow,
  PlannerFeedChanges,
} from '../feeds/registry';
import { HolidayRegionError, assertHolidayRegion, regionName } from './rules';

export type HolidayFeedStore = Pick<Store, 'host'>;

interface Written {
  signature: string;
  readonly years: Set<number>;
}

const DAY_MS = 86_400_000;

function refused(cause: unknown): never {
  if (cause instanceof HolidayRegionError) throw new ApiError('invalid_request', cause.message);
  throw cause;
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

  async create(request: FeedCreateRequest): Promise<PlannerCollectionRow> {
    const { input, profileId } = request;
    if (input.kind !== 'holidays') throw new ApiError('invalid_request', 'This is not holidays.');
    try {
      assertHolidayRegion(input.country, input.state);
    } catch (cause) {
      refused(cause);
    }
    return this.store.host.write('plannerFeedCollectionInsert', {
      input: {
        profile_id: profileId,
        kind: 'calendar',
        name: input.name ?? `Holidays, ${regionName(input.country, input.state)}`,
        colour: input.colour ?? 'family',
        icon: 'calendar',
        visible: true,
        default_reminders: [],
        audience: 'personal',
        source: 'feed',
        google: null,
        feed: { kind: 'holidays', country: input.country, state: input.state },
      },
    });
  }

  async update(
    collection: PlannerCollectionRow,
    changes: PlannerFeedChanges,
  ): Promise<PlannerCollectionRow> {
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
    this.written.delete(collection.id);
    return this.store.host.write('plannerHolidaysRegion', { collection, country, state });
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

  async prepare(collection: PlannerCollectionRow, window: FeedWindow): Promise<void> {
    const { feed } = collection;
    if (feed?.kind !== 'holidays') return;
    const signature = `${feed.country}|${feed.state ?? ''}`;
    const known = this.written.get(collection.id);
    const memory = known?.signature === signature ? known : { signature, years: new Set<number>() };
    this.written.set(collection.id, memory);
    const missing = yearsOf(window).filter((year) => !memory.years.has(year));
    if (missing.length === 0) return;
    await this.store.host.write('plannerHolidaysYears', { collection, years: missing });
    for (const year of missing) memory.years.add(year);
  }
}
