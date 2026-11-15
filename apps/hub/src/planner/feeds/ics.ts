import { ApiError, type PlannerCollectionRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { FeedAddressError, assertReachable, feedUrlOf } from '../subscriptions/address';
import type { FeedSubscriptions } from '../subscriptions/manager';
import type { FeedCreateRequest, FeedKindHandler, PlannerFeedChanges } from './registry';

export type IcsFeedStore = Pick<Store, 'plannerCollections' | 'personAccess'>;

function refused(cause: unknown): never {
  if (cause instanceof FeedAddressError) throw new ApiError('invalid_request', cause.message);
  throw cause;
}

async function checked(store: IcsFeedStore, profileId: string, url: string): Promise<void> {
  try {
    await assertReachable(feedUrlOf(url), store.personAccess.find(profileId)?.role === 'owner');
  } catch (cause) {
    refused(cause);
  }
}

function nextPosition(store: IcsFeedStore, profileId: string): number {
  return store.plannerCollections
    .list(profileId)
    .reduce((highest, row) => Math.max(highest, row.position + 1), 0);
}

export class IcsFeedKind implements FeedKindHandler {
  readonly kind = 'ics';

  constructor(
    private readonly store: IcsFeedStore,
    private readonly subscriptions: Pick<FeedSubscriptions, 'refresh'>,
  ) {}

  async create(request: FeedCreateRequest): Promise<PlannerCollectionRow> {
    const { input, profileId } = request;
    if (input.kind !== 'ics') throw new ApiError('invalid_request', 'This is not an address.');
    await checked(this.store, profileId, input.url);
    const collection = this.store.plannerCollections.insert({
      profile_id: profileId,
      kind: 'calendar',
      name: input.name ?? feedUrlOf(input.url).hostname,
      colour: input.colour ?? 'personal',
      icon: 'calendar',
      position: nextPosition(this.store, profileId),
      visible: true,
      default_reminders: [],
      audience: 'personal',
      source: 'feed',
      google: null,
      feed: {
        kind: 'ics',
        url: input.url,
        refresh_minutes: input.refresh_minutes,
        etag: null,
        last_modified: null,
        fetched_at: null,
        failure: null,
      },
    });
    return this.subscriptions.refresh(collection.id);
  }

  async update(
    collection: PlannerCollectionRow,
    changes: PlannerFeedChanges,
  ): Promise<PlannerCollectionRow> {
    const { feed } = collection;
    if (feed?.kind !== 'ics') throw new ApiError('invalid_request', 'This is not a subscription.');
    if (changes.country !== undefined || changes.state !== undefined) {
      throw new ApiError('invalid_request', 'A subscription has an address, not a country.');
    }
    const url = changes.url ?? feed.url;
    if (changes.url !== undefined) {
      await checked(this.store, collection.profile_id, url);
    }
    const moved = url !== feed.url;
    const updated = this.store.plannerCollections.update(collection.id, collection.profile_id, {
      feed: {
        ...feed,
        url,
        refresh_minutes: changes.refresh_minutes ?? feed.refresh_minutes,
        ...(moved ? { etag: null, last_modified: null, fetched_at: null, failure: null } : {}),
      },
    });
    return moved ? this.subscriptions.refresh(updated.id) : updated;
  }

  refresh(collection: PlannerCollectionRow): Promise<PlannerCollectionRow> {
    return this.subscriptions.refresh(collection.id);
  }

  readonly prepare = (): void => undefined;
}
