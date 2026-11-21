import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import { plannerCollectionRoutes, plannerItemRoutes } from './handlers/planner-items';
import { plannerPreferenceRoutes } from './handlers/planner-preferences';
import { feedOriginOf, plannerFeedRoutes } from './handlers/planner-feeds';
import { plannerCoreRoutes } from './handlers/planner';
import { plannerSharingRoutes } from './handlers/planner-sharing';
import { plannerBookingRoutes } from './handlers/planner-booking';
import { plannerInviteRoutes } from './handlers/planner-invites';
import { mailRoutes } from './handlers/mail';
import { collabOf } from './planner-collab';
import { plannerSearchRoutes } from './handlers/planner-search';
import { plannerHolidayRoutes } from './handlers/planner-holidays';
import { plannerBedtimeRoutes } from './handlers/planner-bedtime';
import { RadioDirectory } from '../planner/radio';
import { plannerClockRoutes } from './handlers/planner-clock';
import { deviceScopeOf } from './person-scope';
import { loadPlannerPreferences, plannerPreferencesOf } from '../planner/preferences';
import { triggerCatalogueOf } from '../signals/trigger-catalogue-of';

type PlannerOptions = Pick<BuildOptions, 'clock' | 'core' | 'fetch' | 'version'>;

function plannerDayRoutes(
  context: ServerContext,
  options: PlannerOptions,
): ReturnType<typeof plannerCoreRoutes> &
  ReturnType<typeof plannerClockRoutes> &
  ReturnType<typeof plannerBedtimeRoutes> &
  ReturnType<typeof plannerFeedRoutes> {
  const { now } = options.clock;
  const { planner } = options.core;
  return {
    ...plannerCoreRoutes(context, {
      now,
      preferencesOf: (profileId) => plannerPreferencesOf(context.store, profileId),
      feeds: planner.feeds,
      catalogueOf: (caller) =>
        triggerCatalogueOf(context.store, deviceScopeOf(context.store, caller)),
    }),
    ...plannerClockRoutes(context, {
      preferencesOf: (profileId) => loadPlannerPreferences(context.store, profileId),
      alarms: planner.alarms,
      timers: planner.timers,
      stopwatch: planner.stopwatch,
      phoneRings: planner.phoneRings,
      sounds: planner.sounds,
      radio: new RadioDirectory({ fetch: options.fetch, version: options.version }),
    }),
    ...plannerBedtimeRoutes(context, { sleepSound: planner.sleepSound }),
    ...plannerFeedRoutes(context, { feeds: planner.feeds, origin: feedOriginOf(context) }),
  };
}

export function plannerRoutes(
  context: ServerContext,
  options: PlannerOptions,
): ReturnType<typeof plannerDayRoutes> &
  ReturnType<typeof plannerItemRoutes> &
  ReturnType<typeof plannerSharingRoutes> &
  ReturnType<typeof plannerBookingRoutes> &
  ReturnType<typeof plannerInviteRoutes> &
  ReturnType<typeof mailRoutes> &
  ReturnType<typeof plannerSearchRoutes> &
  ReturnType<typeof plannerHolidayRoutes> &
  ReturnType<typeof plannerCollectionRoutes> &
  ReturnType<typeof plannerPreferenceRoutes> {
  const { now } = options.clock;
  const { planner } = options.core;
  const collab = collabOf(context, now);
  return {
    ...plannerDayRoutes(context, options),
    ...plannerItemRoutes(context),
    ...plannerSharingRoutes(context, now),
    ...plannerBookingRoutes(context),
    ...plannerInviteRoutes(context, collab),
    ...mailRoutes({ settings: collab.settings, service: collab.mail }),
    ...plannerSearchRoutes(context, { now, feeds: planner.feeds }),
    ...plannerHolidayRoutes(),
    ...plannerCollectionRoutes(context),
    ...plannerPreferenceRoutes(context, (profileId) => {
      planner.preferencesChanged(profileId);
    }),
  };
}
