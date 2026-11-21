import { PLANNER_SUMMARY, type PlannerItemRow, type PlannerSummary } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { composeDayFromStore, summarise } from '../day';
import { plannerPreferencesOf } from './preferences-of';
import { involvedProfiles, profilesSeeing } from '../sharing/visibility';

function summaryOf(
  store: HostStore,
  { profileId, nowMs }: { readonly profileId: string; readonly nowMs: number },
): PlannerSummary {
  const timeZone = store.settings.read().time_zone;
  const now = Temporal.Instant.fromEpochMilliseconds(nowMs);
  const day = composeDayFromStore(store, {
    profileId,
    date: now.toZonedDateTimeISO(timeZone).toPlainDate().toString(),
    timeZone,
    now,
    lastOpen: null,
    preferences: plannerPreferencesOf(store, profileId),
    sleep: [],
    sessions: [],
  });
  const runningTimers = store.plannerTimers
    .list(profileId)
    .filter((timer) => timer.state === 'running').length;
  return PLANNER_SUMMARY.parse({ personId: profileId, ...summarise(day), runningTimers });
}

export const PLANNER_SUMMARY_READ_UNITS = {
  plannerSummary: storeUnit(summaryOf),
  plannerItemViewers: storeUnit((store, { itemId }: { readonly itemId: string }): string[] =>
    profilesSeeing(store, itemId),
  ),
  plannerItemInvolved: storeUnit((store, { item }: { readonly item: PlannerItemRow }): string[] =>
    involvedProfiles(store, item),
  ),
} as const;
