import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import { BirthdaysFeedKind, type BirthdayFeedStore } from '../birthdays/feed';
import type { CalendarReader } from '../ical/calendar-reader';
import { HolidaysFeedKind, type HolidayFeedStore } from '../holidays/feed';
import { FeedSubscriptions } from '../subscriptions/manager';
import type { SubscriptionStore } from '../subscriptions/subscription';
import { fetchFeed } from '../subscriptions/transport';
import { IcsFeedKind } from './ics';
import { FeedRegistry } from './registry';

export interface FeedServiceOptions {
  readonly store: SubscriptionStore & BirthdayFeedStore & HolidayFeedStore;
  readonly clock: Clock;
  readonly calendars: CalendarReader;
  readonly log: Logger;
}

export class FeedService {
  readonly registry = new FeedRegistry();
  readonly subscriptions: FeedSubscriptions;
  private readonly birthdays: BirthdaysFeedKind;
  private stopBirthdays: (() => void) | null = null;

  constructor(options: FeedServiceOptions) {
    this.subscriptions = new FeedSubscriptions({ ...options, fetcher: fetchFeed });
    this.registry.register(new IcsFeedKind(options.store, this.subscriptions));
    this.registry.register(new HolidaysFeedKind(options.store));
    this.birthdays = new BirthdaysFeedKind(options.store);
    this.registry.register(this.birthdays);
  }

  start(): void {
    this.subscriptions.start();
    this.stopBirthdays ??= this.birthdays.watch();
  }

  async settled(): Promise<void> {
    await this.subscriptions.settled();
    await this.birthdays.settled();
  }

  stop(): void {
    this.subscriptions.stop();
    this.stopBirthdays?.();
    this.stopBirthdays = null;
  }
}
