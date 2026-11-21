import type { PlannerCollectionRow, PlannerFeed } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import { ScheduledFetch } from '../../scheduled-fetch';
import type { Store } from '../../store/store';
import type { CalendarReader } from '../ical/calendar-reader';
import { feedUrlOf } from './address';
import { FEED_DEADLINE_MS, type FeedAnswer, type FeedRequest } from './transport';

export type SubscriptionStore = Pick<Store, 'host' | 'feed' | 'live'>;

export type FeedFetcher = (request: FeedRequest) => Promise<FeedAnswer>;

export interface SubscriptionDeps {
  readonly store: SubscriptionStore;
  readonly clock: Clock;
  readonly log: Logger;
  readonly fetcher: FeedFetcher;
  readonly calendars: CalendarReader;
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
    const { collection, allowPrivate } = await store.host.read('plannerFeedSource', {
      collectionId: this.collectionId,
    });
    const feed = icsFeedOf(collection);
    const request: FeedRequest = {
      url: feedUrlOf(feed.url),
      etag: feed.etag,
      lastModified: feed.last_modified,
      allowPrivate,
      signal: AbortSignal.timeout(FEED_DEADLINE_MS),
    };
    try {
      const answer = await this.deps.fetcher(request);
      const stored = await this.record(collection, answer);
      this.job.reset();
      this.scheduleNext(stored);
      return stored;
    } catch (cause) {
      log.warn('planner.feed_failed', { collection: collection.id, reason: messageOf(cause) });
      const failed = await this.touch(collection, messageOf(cause));
      this.job.schedule(this.job.retryAt());
      return failed;
    }
  }

  private async record(
    collection: PlannerCollectionRow,
    answer: FeedAnswer,
  ): Promise<PlannerCollectionRow> {
    const { store, clock, log } = this.deps;
    if (answer.kind === 'not_modified') {
      log.info('planner.feed_fetched', { collection: collection.id, outcome: 'not_modified' });
      return this.touch(collection, null);
    }
    const calendar = await this.deps.calendars.read(answer.text, {
      defaultZone: store.live.home.settings.read().time_zone,
    });
    const applied = await store.host.write('plannerFeedApply', {
      collectionId: collection.id,
      url: icsFeedOf(collection).url,
      entries: calendar.entries,
      etag: answer.etag,
      lastModified: answer.lastModified,
      nowMs: clock.now().getTime(),
    });
    if (applied === null) return collection;
    this.statedMinutes = calendar.refreshMinutes;
    log.info('planner.feed_fetched', {
      collection: collection.id,
      outcome: 'changed',
      ...applied.counts,
      unsupported: calendar.unsupported.length,
      statedMinutes: calendar.refreshMinutes,
    });
    return applied.row;
  }

  private async touch(
    collection: PlannerCollectionRow,
    failure: string | null,
  ): Promise<PlannerCollectionRow> {
    const touched = await this.deps.store.host.write('plannerFeedTouch', {
      collectionId: collection.id,
      url: icsFeedOf(collection).url,
      failure,
      nowMs: this.deps.clock.now().getTime(),
    });
    return touched ?? collection;
  }
}
