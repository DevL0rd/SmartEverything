import { createHash } from 'node:crypto';
import {
  WATCH_CALENDAR_LIMIT,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type PlannerOccurrenceView,
  type PlannerPreferences,
  type WatchCalendarEvent,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { composeRange } from './range';
import { isWatchDevice, type WatchChannel } from './watch-projection';

export type WatchCalendarStore = Pick<
  Store,
  'plannerItems' | 'plannerOccurrences' | 'plannerCollections' | 'devices' | 'settings' | 'feed'
>;

export interface WatchCalendarOptions {
  readonly store: WatchCalendarStore;
  readonly channel: WatchChannel;
  readonly profileOf: (deviceId: string) => string | null;
  readonly preferences: (profileId: string) => PlannerPreferences;
  readonly refresh: (profileId: string) => Promise<void>;
  readonly now: () => Date;
  readonly log: Logger;
}

const FIRST_WINDOW_DAYS = 14;
const LONGEST_REPEAT_DAYS = 366;
const REMIND_LIMIT_MINUTES = 40_320;
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 120;
const LOCATION_LIMIT = 60;

function clipped(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('');
}

function upcoming(views: readonly PlannerOccurrenceView[], now: Date): PlannerOccurrenceView[] {
  return views
    .filter(
      (view) =>
        view.kind === 'event' &&
        view.status !== 'cancelled' &&
        view.start !== null &&
        Date.parse(view.end ?? view.start) >= now.getTime(),
    )
    .sort((left, right) => Date.parse(left.start ?? '') - Date.parse(right.start ?? ''));
}

function remindOf(
  item: PlannerItemRow | undefined,
  collection: PlannerCollectionRow | undefined,
): number | null {
  const minutes = (item?.reminders[0] ?? collection?.default_reminders[0])?.minutes_before;
  return minutes === undefined ? null : Math.min(minutes, REMIND_LIMIT_MINUTES);
}

export class WatchCalendar {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly sent = new Map<string, string>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: WatchCalendarOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'planner_items' || change.table === 'planner_collections') {
        this.changed(change.record?.profile_id ?? change.oldRecord?.profile_id ?? null);
      } else if (change.table === 'planner_occurrences') {
        this.changedForAll();
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  connected(deviceId: string): void {
    const profileId = this.options.profileOf(deviceId);
    if (profileId !== null) this.enqueue(profileId, [deviceId], true);
  }

  preferencesChanged(profileId: string): void {
    this.enqueue(profileId, this.watchesOf(profileId), true);
  }

  private changed(profileId: string | null): void {
    if (profileId !== null) this.enqueue(profileId, this.watchesOf(profileId), false);
  }

  private changedForAll(): void {
    const profiles = new Set<string>();
    for (const device of this.options.store.devices.list()) {
      const profileId = isWatchDevice(device) ? this.options.profileOf(device.id) : null;
      if (profileId !== null) profiles.add(profileId);
    }
    for (const profileId of profiles) this.changed(profileId);
  }

  private watchesOf(profileId: string): string[] {
    return this.options.store.devices
      .list()
      .filter((device) => isWatchDevice(device) && this.options.profileOf(device.id) === profileId)
      .map((device) => device.id);
  }

  private enqueue(profileId: string, deviceIds: readonly string[], force: boolean): void {
    if (deviceIds.length === 0 || !this.options.preferences(profileId).watch.watch_calendar_push) {
      return;
    }
    const next = (this.tails.get(profileId) ?? Promise.resolve()).then(() =>
      this.push(profileId, deviceIds, force),
    );
    this.tails.set(
      profileId,
      next.then(undefined, (cause: unknown) => {
        this.options.log.error('planner.watch_calendar_failed', cause, { profileId });
      }),
    );
  }

  private async push(
    profileId: string,
    deviceIds: readonly string[],
    force: boolean,
  ): Promise<void> {
    await this.options.refresh(profileId);
    const events = this.eventsOf(profileId);
    const digest = createHash('sha256').update(JSON.stringify(events)).digest('hex');
    for (const deviceId of deviceIds) {
      if (!force && this.sent.get(deviceId) === digest) continue;
      const outcome = await this.options.channel.send(deviceId, { type: 'set_calendar', events });
      if (outcome.ok) {
        this.sent.set(deviceId, digest);
      } else {
        this.sent.delete(deviceId);
        this.options.log.warn('planner.watch_calendar_unsent', {
          deviceId,
          detail: outcome.detail,
        });
      }
    }
  }

  private eventsOf(profileId: string): WatchCalendarEvent[] {
    const { store } = this.options;
    const now = this.options.now();
    const collections = store.plannerCollections
      .list(profileId)
      .filter((collection) => collection.kind === 'calendar' && collection.visible);
    const views = this.nearest(profileId, collections, now);
    return views.slice(0, WATCH_CALENDAR_LIMIT).map((view) => {
      const item = store.plannerItems.find(view.item_id, profileId);
      const collection = collections.find((candidate) => candidate.id === view.collection_id);
      return this.eventOf(view, item, collection);
    });
  }

  private nearest(
    profileId: string,
    collections: readonly PlannerCollectionRow[],
    now: Date,
  ): PlannerOccurrenceView[] {
    const { store } = this.options;
    const timeZone = store.settings.read().time_zone;
    const from = Temporal.Instant.fromEpochMilliseconds(now.getTime());
    for (let days = FIRST_WINDOW_DAYS; ; days *= 2) {
      const range = composeRange(store, {
        profileId,
        window: { from, to: from.add({ hours: days * 24 }), timeZone },
        now: from,
        collectionIds: collections.map((collection) => collection.id),
      });
      const found = upcoming(range.occurrences, now);
      if (
        found.length >= WATCH_CALENDAR_LIMIT ||
        days >= WATCH_CALENDAR_LIMIT * LONGEST_REPEAT_DAYS
      ) {
        return found;
      }
    }
  }

  private eventOf(
    view: PlannerOccurrenceView,
    item: PlannerItemRow | undefined,
    collection: PlannerCollectionRow | undefined,
  ): WatchCalendarEvent {
    const start = Math.floor(Date.parse(view.start ?? '') / 1000);
    const end = view.end === null ? start : Math.floor(Date.parse(view.end) / 1000);
    return {
      title: clipped(view.title, TITLE_LIMIT),
      description: clipped(item?.notes ?? '', DESCRIPTION_LIMIT),
      location: clipped(view.location ?? '', LOCATION_LIMIT),
      start,
      end,
      allDay: view.all_day,
      remindMinutes: remindOf(item, collection),
    };
  }
}
