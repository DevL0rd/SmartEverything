import {
  WATCH_CALENDAR_LIMIT,
  type PlannerAlarmRow,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type PlannerOccurrenceView,
  type WatchCalendarEvent,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { composeRange } from '../range';
import { withLink, type Settled } from '../watch-projection';

export interface WatchLinkApply {
  readonly alarmId: string;
  readonly profileId: string;
  readonly deviceId: string;
  readonly settled: Settled;
}

export const PLANNER_WATCH_WRITE_UNITS = {
  plannerWatchLinkApply: storeUnit(
    (store, { alarmId, profileId, deviceId, settled }: WatchLinkApply): PlannerAlarmRow | null => {
      const fresh = store.plannerAlarms.find(alarmId, profileId);
      if (fresh === undefined) return null;
      return store.plannerAlarms.update(fresh.id, fresh.profile_id, {
        ...settled.fields,
        watch: withLink(fresh.watch, deviceId, settled.link),
      });
    },
  ),
} as const;

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

function nearest(
  store: HostStore,
  profileId: string,
  collections: readonly PlannerCollectionRow[],
  now: Date,
): PlannerOccurrenceView[] {
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

function eventOf(
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

function watchEvents(
  store: HostStore,
  { profileId, nowMs }: { readonly profileId: string; readonly nowMs: number },
): WatchCalendarEvent[] {
  const now = new Date(nowMs);
  const collections = store.plannerCollections
    .list(profileId)
    .filter((collection) => collection.kind === 'calendar' && collection.visible);
  return nearest(store, profileId, collections, now)
    .slice(0, WATCH_CALENDAR_LIMIT)
    .map((view) =>
      eventOf(
        view,
        store.plannerItems.find(view.item_id, profileId),
        collections.find((candidate) => candidate.id === view.collection_id),
      ),
    );
}

export const PLANNER_WATCH_READ_UNITS = {
  plannerWatchEvents: storeUnit(watchEvents),
} as const;
