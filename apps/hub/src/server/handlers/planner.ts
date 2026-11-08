import {
  API_ENDPOINTS as E,
  ApiError,
  type PlannerCollectionRow,
  type PlannerPreferences,
  type TriggerCatalogue,
} from '@smarteverything/domain';
import { composeDayFromStore } from '../../planner/day';
import { freeSlotsFromStore } from '../../planner/free-slots';
import { parsePlannerText } from '../../planner/parse';
import { acceptProposal, rejectProposal } from '../../planner/proposals';
import { composeRange } from '../../planner/range';
import { composeStats } from '../../planner/stats';
import { suggestCompletions } from '../../planner/suggest-completion';
import type { Caller } from '../auth';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-items';

export interface PlannerCoreDependencies {
  readonly now: () => Date;
  readonly preferencesOf: (profileId: string) => PlannerPreferences;
  readonly catalogueOf: (caller: Caller) => TriggerCatalogue;
}

export type PlannerCoreContext = PlannerContext;

const PREVIEW_COUNT = 5;

function instantOf(now: () => Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(now().getTime());
}

function zoneOf(context: PlannerCoreContext): string {
  return context.store.settings.read().time_zone;
}

function dayRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'readPlannerDay'> {
  return bound(E.readPlannerDay, ({ query, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    return composeDayFromStore(context.store, {
      profileId,
      date: query.date,
      timeZone: zoneOf(context),
      now: instantOf(deps.now),
      lastOpen: null,
      preferences: deps.preferencesOf(profileId),
      sleep: [],
      sessions: [],
    });
  });
}

function rangeRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'readPlannerRange'> {
  return bound(E.readPlannerRange, ({ query, caller }) =>
    composeRange(context.store, {
      profileId: plannerProfileOf(context, caller, query.personId),
      window: {
        from: Temporal.Instant.from(query.from),
        to: Temporal.Instant.from(query.to),
        timeZone: zoneOf(context),
      },
      now: instantOf(deps.now),
      collectionIds: query.collections,
    }),
  );
}

function statsRoute(
  context: PlannerCoreContext,
  deps: PlannerCoreDependencies,
): RouteOf<'readPlannerStats'> {
  return bound(E.readPlannerStats, ({ query, caller }) =>
    composeStats(context.store, {
      profileId: plannerProfileOf(context, caller, query.personId),
      range: query.range,
      now: instantOf(deps.now),
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
  return bound(E.parsePlannerText, ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const collections = context.store.plannerCollections.list(profileId);
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
  return bound(E.plannerFreeSlots, ({ query, body, caller }) => [
    ...freeSlotsFromStore(context.store, {
      profileId: plannerProfileOf(context, caller, query.personId),
      from: Temporal.Instant.from(body.from),
      to: Temporal.Instant.from(body.to),
      minutes: body.minutes,
      timeZone: zoneOf(context),
      now: instantOf(deps.now),
    }),
  ]);
}

function proposalRoutes(context: PlannerCoreContext): {
  readonly acceptPlannerProposal: RouteOf<'acceptPlannerProposal'>;
  readonly rejectPlannerProposal: RouteOf<'rejectPlannerProposal'>;
} {
  return {
    acceptPlannerProposal: bound(E.acceptPlannerProposal, ({ params, query, caller }) =>
      context.store.write(() =>
        acceptProposal(context.store, plannerProfileOf(context, caller, query.personId), params.id),
      ),
    ),
    rejectPlannerProposal: bound(E.rejectPlannerProposal, ({ params, query, caller }) => {
      context.store.write(() => {
        rejectProposal(context.store, plannerProfileOf(context, caller, query.personId), params.id);
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
