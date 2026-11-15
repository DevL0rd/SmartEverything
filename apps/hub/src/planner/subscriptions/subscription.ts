import type { PlannerCollectionRow, PlannerFeed } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import { ScheduledFetch } from '../../scheduled-fetch';
import type { Store } from '../../store/store';
import { applyEntries } from '../ical/apply';
import { readCalendar } from '../ical/read';
import { feedUrlOf } from './address';
import { FEED_DEADLINE_MS, type FeedAnswer, type FeedRequest } from './transport';

export type SubscriptionStore = Pick<
  Store,
  | 'write'
  | 'feed'
  | 'settings'
  | 'personAccess'
  | 'plannerCollections'
  | 'plannerItems'
  | 'plannerGuests'
  | 'plannerOccurrences'
>;

export type FeedFetcher = (request: FeedRequest) => Promise<FeedAnswer>;

export interface SubscriptionDeps {
  readonly store: SubscriptionStore;
  readonly clock: Clock;
  readonly log: Logger;
  readonly fetcher: FeedFetcher;
}

type IcsFeed = Extract<PlannerFeed, { readonly kind: 'ics' }>;

export const FEED_RETRY_SECONDS: readonly number[] = [60, 300, 900, 3600];

const MINUTE_MS = 60_000;

export class FeedNotSubscribedError extends Error {
  override readonly name = 'FeedNotSubscribedError';

  constructor(readonly collectionId: string) {
    super(`The calendar ${collectionId} is not a subscription to a calendar address.`);
  }
}

export function icsFeedOf(collection: PlannerCollectionRow): IcsFeed {
  const { feed } = collection;
  if (feed?.kind !== 'ics') throw new FeedNotSubscribedError(collection.id);
  return feed;
}

export class FeedSubscription {
  private readonly job: ScheduledFetch<PlannerCollectionRow>;
  private statedMinutes: number | null = null;

  constructor(
    private readonly deps: SubscriptionDeps,
    readonly collectionId: string,
  ) {
    this.job = new ScheduledFetch({
      clock: deps.clock,
      fetch: (): Promise<PlannerCollectionRow> => this.pull(),
      retrySeconds: FEED_RETRY_SECONDS,
      minGapMs: 0,
    });
  }

  arm(collection: PlannerCollectionRow): void {
    const feed = icsFeedOf(collection);
    const now = this.deps.clock.now().getTime();
    let due = now;
    if (feed.failure !== null) {
      due = Date.parse(feed.failure.at) + (FEED_RETRY_SECONDS[0] ?? 60) * 1000;
    } else if (feed.fetched_at !== null) {
      due = Date.parse(feed.fetched_at) + this.intervalMinutes(feed) * MINUTE_MS;
    }
    this.job.schedule(new Date(Math.max(due, now)));
  }

  refresh(): Promise<PlannerCollectionRow> {
    return this.job.run();
  }

  cancel(): void {
    this.job.cancel();
  }

  private intervalMinutes(feed: IcsFeed): number {
    return this.statedMinutes ?? feed.refresh_minutes;
  }

  private scheduleNext(collection: PlannerCollectionRow): void {
    const feed = icsFeedOf(collection);
    const at = this.deps.clock.now().getTime() + this.intervalMinutes(feed) * MINUTE_MS;
    this.job.schedule(new Date(at));
  }

  private async pull(): Promise<PlannerCollectionRow> {
    const { store, log } = this.deps;
    const collection = store.plannerCollections.anyById(this.collectionId);
    const feed = icsFeedOf(collection);
    const request: FeedRequest = {
      url: feedUrlOf(feed.url),
      etag: feed.etag,
      lastModified: feed.last_modified,
      allowPrivate: store.personAccess.find(collection.profile_id)?.role === 'owner',
      signal: AbortSignal.timeout(FEED_DEADLINE_MS),
    };
    try {
      const answer = await this.deps.fetcher(request);
      const stored = this.record(collection, answer);
      this.job.reset();
      this.scheduleNext(stored);
      return stored;
    } catch (cause) {
      log.warn('planner.feed_failed', { collection: collection.id, reason: messageOf(cause) });
      const failed = this.fail(collection, cause);
      this.job.schedule(this.job.retryAt());
      return failed;
    }
  }

  private current(collection: PlannerCollectionRow): PlannerCollectionRow | undefined {
    const latest = this.deps.store.plannerCollections.findAny(collection.id);
    return latest?.feed?.kind === 'ics' && latest.feed.url === icsFeedOf(collection).url
      ? latest
      : undefined;
  }

  private record(collection: PlannerCollectionRow, answer: FeedAnswer): PlannerCollectionRow {
    const { store, clock, log } = this.deps;
    const latest = this.current(collection);
    if (latest === undefined) return collection;
    const feed = icsFeedOf(latest);
    const fetchedAt = clock.now().toISOString();
    if (answer.kind === 'not_modified') {
      log.info('planner.feed_fetched', { collection: collection.id, outcome: 'not_modified' });
      return store.plannerCollections.update(latest.id, latest.profile_id, {
        feed: { ...feed, fetched_at: fetchedAt, failure: null },
      });
    }
    const calendar = readCalendar(answer.text, { defaultZone: store.settings.read().time_zone });
    this.statedMinutes = calendar.refreshMinutes;
    const tally = store.write(() => {
      const counts = applyEntries(
        store,
        clock.now,
        {
          profileId: latest.profile_id,
          collectionId: latest.id,
          createdBy: 'feed',
          removeMissing: true,
        },
        calendar.entries,
      );
      const row = store.plannerCollections.update(latest.id, latest.profile_id, {
        feed: {
          ...feed,
          etag: answer.etag,
          last_modified: answer.lastModified,
          fetched_at: fetchedAt,
          failure: null,
        },
      });
      return { counts, row };
    });
    log.info('planner.feed_fetched', {
      collection: collection.id,
      outcome: 'changed',
      ...tally.counts,
      unsupported: calendar.unsupported.length,
      statedMinutes: calendar.refreshMinutes,
    });
    return tally.row;
  }

  private fail(collection: PlannerCollectionRow, cause: unknown): PlannerCollectionRow {
    const { store, clock } = this.deps;
    const latest = this.current(collection);
    if (latest === undefined) return collection;
    return store.plannerCollections.update(latest.id, latest.profile_id, {
      feed: {
        ...icsFeedOf(latest),
        failure: { at: clock.now().toISOString(), reason: messageOf(cause) },
      },
    });
  }
}
