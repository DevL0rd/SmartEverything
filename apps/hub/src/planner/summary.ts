import {
  PLANNER_SUMMARY,
  type LiveChange,
  type PlannerPreferences,
  type PlannerSummary,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import { composeDayFromStore, summarise, type DayReader } from './day';
import { profilesSeeing, type PlannerAccessStore } from './sharing/visibility';

export type SummaryStore = DayReader &
  PlannerAccessStore &
  Pick<Store, 'profiles' | 'settings' | 'plannerTimers' | 'feed'>;

export interface SummaryDeskOptions {
  readonly store: SummaryStore;
  readonly clock: Pick<Clock, 'now'>;
  readonly preferencesOf: (profileId: string) => PlannerPreferences;
  readonly log: Logger;
}

export function profilesOfItem(store: SummaryStore, itemId: string): string[] {
  return profilesSeeing(store, itemId);
}

export class SummaryDesk {
  private readonly published = new Map<string, string>();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(private readonly options: SummaryDeskOptions) {}

  start(): void {
    this.refreshAll();
    const { feed } = this.options.store;
    this.unsubscribe.push(
      feed.subscribe((change) => {
        this.follow(change);
      }),
      feed.subscribeNotices((notice) => {
        if (notice.type === 'planner_ring') this.refreshAll();
      }),
    );
  }

  stop(): void {
    for (const off of this.unsubscribe.splice(0)) off();
    this.published.clear();
  }

  summaryOf(profileId: string): PlannerSummary {
    const { store, clock } = this.options;
    const timeZone = store.settings.read().time_zone;
    const now = Temporal.Instant.fromEpochMilliseconds(clock.now().getTime());
    const day = composeDayFromStore(store, {
      profileId,
      date: now.toZonedDateTimeISO(timeZone).toPlainDate().toString(),
      timeZone,
      now,
      lastOpen: null,
      preferences: this.options.preferencesOf(profileId),
      sleep: [],
      sessions: [],
    });
    const runningTimers = store.plannerTimers
      .list(profileId)
      .filter((timer) => timer.state === 'running').length;
    return PLANNER_SUMMARY.parse({ personId: profileId, ...summarise(day), runningTimers });
  }

  refresh(profileId: string): void {
    const summary = this.summaryOf(profileId);
    const text = JSON.stringify(summary);
    if (this.published.get(profileId) === text) return;
    this.published.set(profileId, text);
    this.options.store.feed.notice({ type: 'planner_summary', ...summary });
    this.options.log.debug('planner.summary_published', { profileId });
  }

  refreshAll(): void {
    for (const profile of this.options.store.profiles.list()) this.refresh(profile.id);
  }

  private follow(change: LiveChange): void {
    if (change.table === 'settings') this.refreshAll();
    else if (change.table === 'planner_occurrences') {
      this.followOccurrence(change.record ?? change.oldRecord);
    } else if (change.table === 'planner_items') {
      if (change.record === null) this.refreshAll();
      else this.refreshSeeing(change.record.id, change.record.profile_id);
    } else if (change.table === 'planner_guests') {
      const row = change.record ?? change.oldRecord;
      if (row !== null) this.refreshSeeing(row.item_id, null);
    } else {
      this.followOwned(change);
    }
  }

  private followOwned(change: LiveChange): void {
    if (
      change.table !== 'planner_collection_shares' &&
      change.table !== 'planner_alarms' &&
      change.table !== 'planner_timers'
    ) {
      return;
    }
    const row = change.record ?? change.oldRecord;
    if (row !== null) this.refresh(row.profile_id);
  }

  private refreshSeeing(itemId: string, owner: string | null): void {
    const seeing = new Set([
      ...profilesOfItem(this.options.store, itemId),
      ...(owner === null ? [] : [owner]),
    ]);
    if (seeing.size === 0) this.refreshAll();
    else for (const profileId of seeing) this.refresh(profileId);
  }

  private followOccurrence(row: { readonly item_id: string } | null): void {
    if (row === null) this.refreshAll();
    else this.refreshSeeing(row.item_id, null);
  }
}
