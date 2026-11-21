import {
  API_ENDPOINTS as E,
  ApiError,
  type PlannerCollectionRow,
  type PlannerPreferences,
  type TriggerCatalogue,
} from '@smarteverything/domain';
import { frameOf } from '../../planner/day';
import type { FeedService } from '../../planner/feeds';
import { parsePlannerText } from '../../planner/parse';
import { isoOf } from '../../planner/instants';
import { suggestCompletions } from '../../planner/suggest-completion';
import type { Caller } from '../auth';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-profile';
import { personHour24 } from '../../clock/person-clock';

export interface PlannerCoreDependencies {
  readonly now: () => Date;
  readonly preferencesOf: (profileId: string) => PlannerPreferences;
  readonly catalogueOf: (caller: Caller) => TriggerCatalogue;
  readonly feeds: Pick<FeedService, 'registry'>;
}

export type PlannerCoreContext = PlannerContext;

const PREVIEW_COUNT = 5;

function zoneOf(context: PlannerCoreContext): string {
  return context.store.settings.read().time_zone;
}

function dayRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'readPlannerDay'> {
  return bound(E.readPlannerDay, async ({ query, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const now = deps.now().getTime();
    const preferences = deps.preferencesOf(profileId);
    const timeZone = zoneOf(context);
    const frame = frameOf({
      date: query.date,
      timeZone,
      now: Temporal.Instant.fromEpochMilliseconds(now),
      lastOpen: null,
      preferences,
    });
    const { host } = context.store;
    await deps.feeds.registry.prepare(await host.read('plannerVisibleCollections', { profileId }), {
      from: isoOf(frame.lookbackFrom),
      to: isoOf(frame.dayEnd),
    });
    return host.read('plannerDayView', {
      profileId,
      date: query.date,
      timeZone,
      nowMs: now,
      preferences,
    });
  });
}

function rangeRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'readPlannerRange'> {
  return bound(E.readPlannerRange, async ({ query, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const { host } = context.store;
    await deps.feeds.registry.prepare(await host.read('plannerVisibleCollections', { profileId }), {
      from: query.from,
      to: query.to,
    });
    return host.read('plannerRangeView', {
      profileId,
      from: query.from,
      to: query.to,
      timeZone: zoneOf(context),
      nowMs: deps.now().getTime(),
      collectionIds: query.collections,
    });
  });
}

function statsRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'readPlannerStats'> {
  return bound(E.readPlannerStats, ({ query, caller }) =>
    context.store.host.read('plannerStatsView', {
      profileId: plannerProfileOf(context, caller, query.personId),
      range: query.range,
      nowMs: deps.now().getTime(),
      timeZone: zoneOf(context),
    }),
  );
}

function targetCollection(
  collections: readonly PlannerCollectionRow[],
  chosen: string | undefined,
  preferred: string | null,
): PlannerCollectionRow {
  const byId = (id: string | null): PlannerCollectionRow | undefined =>
    collections.find((collection) => collection.id === id);
  if (chosen !== undefined) {
    const explicit = byId(chosen);
    if (explicit === undefined) {
      throw new ApiError('not_found', 'That calendar or list does not exist.');
    }
    return explicit;
  }
  const fallback =
    byId(preferred) ??
    collections.find((collection) => collection.kind === 'list') ??
    collections[0];
  if (fallback === undefined) {
    throw new ApiError('invalid_request', 'Create a calendar or a list first.');
  }
  return fallback;
}

function parseRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'parsePlannerText'> {
  return bound(E.parsePlannerText, async ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const collections = await context.store.host.read('plannerWritableCollections', { profileId });
    const target = targetCollection(
      collections,
      body.collection_id,
      deps.preferencesOf(profileId).tasks.default_collection_id,
    );
    return parsePlannerText({
      text: body.text,
      collectionId: target.id,
      collections: collections.map(({ id, name }) => ({ id, name })),
      timeZone: body.time_zone ?? zoneOf(context),
      now: deps.now(),
      previewCount: PREVIEW_COUNT,
      hour24: personHour24(context.store, profileId),
    });
  });
}

function suggestRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'suggestPlannerCompletion'> {
  return bound(E.suggestPlannerCompletion, ({ query, body, caller }) => {
    plannerProfileOf(context, caller, query.personId);
    return suggestCompletions({ ...body, catalogue: deps.catalogueOf(caller) });
  });
}

function freeSlotsRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'plannerFreeSlots'> {
  return bound(E.plannerFreeSlots, ({ query, body, caller }) =>
    context.store.host.read('plannerFreeSlotsView', {
      profileId: plannerProfileOf(context, caller, query.personId),
      from: body.from,
      to: body.to,
      minutes: body.minutes,
      timeZone: zoneOf(context),
      nowMs: deps.now().getTime(),
    }),
  );
}

function proposalRoutes(context: PlannerCoreContext): {
  readonly acceptPlannerProposal: RouteOf<'acceptPlannerProposal'>;
  readonly rejectPlannerProposal: RouteOf<'rejectPlannerProposal'>;
} {
  return {
    acceptPlannerProposal: bound(E.acceptPlannerProposal, ({ params, query, caller }) =>
      context.store.host.write('plannerProposalAccept', {
        profileId: plannerProfileOf(context, caller, query.personId),
        id: params.id,
      }),
    ),
    rejectPlannerProposal: bound(E.rejectPlannerProposal, async ({ params, query, caller }) => {
      await context.store.host.write('plannerProposalReject', {
        profileId: plannerProfileOf(context, caller, query.personId),
        id: params.id,
      });
      return DONE_REPLY;
    }),
  };
}

export const plannerCoreRoutes = (context: PlannerCoreContext, deps: PlannerCoreDependencies) =>
  ({
    readPlannerDay: dayRoute(context, deps),
    readPlannerRange: rangeRoute(context, deps),
    readPlannerStats: statsRoute(context, deps),
    parsePlannerText: parseRoute(context, deps),
    suggestPlannerCompletion: suggestRoute(context, deps),
    plannerFreeSlots: freeSlotsRoute(context, deps),
    ...proposalRoutes(context),
  }) as const;
