import { ApiError, type PlannerCollectionRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { FeedCreateRequest, FeedKindHandler } from '../feeds/registry';
import { PendingWork } from '../pending-work';

export type BirthdayFeedStore = Pick<Store, 'host' | 'feed'>;

export class BirthdaysFeedKind implements FeedKindHandler {
  readonly kind = 'birthdays';
  private readonly work = new PendingWork('planner.birthdays_failed');

  constructor(private readonly store: BirthdayFeedStore) {}

  async create(request: FeedCreateRequest): Promise<PlannerCollectionRow> {
    const { input, profileId } = request;
    if (input.kind !== 'birthdays') {
      throw new ApiError('invalid_request', 'This is not a birthdays calendar.');
    }
    return this.store.host.write('plannerBirthdaysInsert', {
      input: {
        profile_id: profileId,
        kind: 'calendar',
        name: input.name ?? 'Birthdays',
        colour: input.colour ?? 'family',
        icon: 'calendar',
        visible: true,
        default_reminders: [],
        audience: 'personal',
        source: 'feed',
        google: null,
        feed: { kind: 'birthdays' },
      },
    });
  }

  update(): Promise<PlannerCollectionRow> {
    return Promise.reject(
      new ApiError('invalid_request', 'A birthdays calendar has nothing to change here.'),
    );
  }

  async refresh(collection: PlannerCollectionRow): Promise<PlannerCollectionRow> {
    await this.store.host.write('plannerBirthdaysReconcile', { collection });
    return collection;
  }

  async prepare(collection: PlannerCollectionRow): Promise<void> {
    if (collection.feed?.kind === 'birthdays') {
      await this.store.host.write('plannerBirthdaysReconcile', { collection });
    }
  }

  settled(): Promise<void> {
    return this.work.settled();
  }

  watch(): () => void {
    return this.store.feed.subscribe((change) => {
      if (change.table !== 'profiles') return;
      this.work.run(this.store.host.write('plannerBirthdaysReconcile', { collection: null }));
    });
  }
}
