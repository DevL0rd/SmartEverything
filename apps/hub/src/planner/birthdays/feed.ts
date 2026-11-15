import { ApiError, type PlannerCollectionRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { settled } from '../feeds/settled';
import type { FeedCreateRequest, FeedKindHandler } from '../feeds/registry';
import { reconcileBirthdays, type BirthdayStore } from './sync';

export type BirthdayFeedStore = BirthdayStore & Pick<Store, 'plannerCollections' | 'feed'>;

export class BirthdaysFeedKind implements FeedKindHandler {
  readonly kind = 'birthdays';

  constructor(private readonly store: BirthdayFeedStore) {}

  create(request: FeedCreateRequest): Promise<PlannerCollectionRow> {
    return settled(() => this.created(request));
  }

  private created(request: FeedCreateRequest): PlannerCollectionRow {
    const { input, profileId } = request;
    if (input.kind !== 'birthdays') {
      throw new ApiError('invalid_request', 'This is not a birthdays calendar.');
    }
    const { plannerCollections } = this.store;
    const position = plannerCollections
      .list(profileId)
      .reduce((highest, row) => Math.max(highest, row.position + 1), 0);
    return this.store.write(() => {
      const row = plannerCollections.insert({
        profile_id: profileId,
        kind: 'calendar',
        name: input.name ?? 'Birthdays',
        colour: input.colour ?? 'family',
        icon: 'calendar',
        position,
        visible: true,
        default_reminders: [],
        audience: 'personal',
        source: 'feed',
        google: null,
        feed: { kind: 'birthdays' },
      });
      reconcileBirthdays(this.store, row);
      return row;
    });
  }

  update(): Promise<PlannerCollectionRow> {
    return Promise.reject(
      new ApiError('invalid_request', 'A birthdays calendar has nothing to change here.'),
    );
  }

  refresh(collection: PlannerCollectionRow): Promise<PlannerCollectionRow> {
    return settled(() => {
      reconcileBirthdays(this.store, collection);
      return collection;
    });
  }

  prepare(collection: PlannerCollectionRow): void {
    if (collection.feed?.kind === 'birthdays') reconcileBirthdays(this.store, collection);
  }

  watch(): () => void {
    return this.store.feed.subscribe((change) => {
      if (change.table !== 'profiles') return;
      for (const collection of this.store.plannerCollections.feeds('birthdays')) {
        reconcileBirthdays(this.store, collection);
      }
    });
  }
}
