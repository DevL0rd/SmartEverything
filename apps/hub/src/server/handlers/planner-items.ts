import {
  API_ENDPOINTS as E,
  ApiError,
  PLANNER_LOCAL_DATE,
  PLANNER_OCCURRENCE_SINGLE,
  type PlannerEvidence,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { ZodError } from 'zod';
import { instantsOf } from '../../planner/instants';
import { deleteItem, editItem } from '../../planner/series-edit';
import type { Store } from '../../store/store';
import { ownerOrSelf, profileIdOf, roleOfCaller, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { invalid } from '../errors';
import { DONE_REPLY, bound, type RouteOf } from '../router';

export type PlannerContext = Pick<ServerContext, 'store'>;

export function plannerProfileOf(
  context: PlannerContext,
  caller: Caller,
  personId: string | undefined,
): string {
  const own = profileIdOf(context.store, caller);
  if (personId === undefined || personId === own) return own;
  ownerOrSelf(roleOfCaller(caller), false);
  return context.store.profiles.byId(personId).id;
}

function validated<T>(what: string, work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof ZodError) throw invalid(what, cause);
    if (cause instanceof RangeError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

function requireLinks(
  store: Store,
  profileId: string,
  links: {
    readonly collection_id?: string | undefined;
    readonly parent_id?: string | null | undefined;
  },
): void {
  if (links.collection_id !== undefined) {
    store.plannerCollections.byId(links.collection_id, profileId);
  }
  if (links.parent_id !== undefined && links.parent_id !== null) {
    store.plannerItems.byId(links.parent_id, profileId);
  }
}

function nextPosition(positions: readonly { readonly position: number }[]): number {
  return positions.reduce((highest, row) => Math.max(highest, row.position + 1), 0);
}

function requireKey(item: PlannerItemRow, key: string): void {
  const single = key === PLANNER_OCCURRENCE_SINGLE;
  if (item.rrule === null && !single) {
    throw new ApiError('invalid_request', 'This item does not repeat, so it has one occurrence.');
  }
  if (item.rrule !== null && single) {
    throw new ApiError('invalid_request', 'A repeating item needs the occurrence it means.');
  }
  if (!single && PLANNER_LOCAL_DATE.safeParse(key).success !== item.all_day) {
    throw new ApiError(
      'invalid_request',
      'The occurrence is a date for an all-day item and a moment otherwise.',
    );
  }
}

function completerOf(evidence: PlannerEvidence | null): PlannerOccurrenceRow['completed_by'] {
  if (evidence === null) return 'person';
  return evidence.deviceId === null ? 'ai' : 'signal';
}

function settled(existing: PlannerOccurrenceRow | undefined): void {
  if (existing?.status === 'done' || existing?.status === 'skipped') {
    throw new ApiError('conflict', `This occurrence is already ${existing.status}.`);
  }
}

function openItemOf(store: Store, profileId: string, itemId: string, key: string): PlannerItemRow {
  const item = store.plannerItems.byId(itemId, profileId);
  requireKey(item, key);
  return item;
}

const OPEN_OCCURRENCE = {
  completed_at: null,
  completed_by: null,
  evidence: null,
  moved_start: null,
  moved_end: null,
} as const;

function createRoute(context: PlannerContext): RouteOf<'createPlannerItem'> {
  const { store } = context;
  return bound(E.createPlannerItem, ({ query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      requireLinks(store, profileId, body);
      const position =
        body.position ??
        nextPosition(store.plannerItems.list(profileId, { collectionIds: [body.collection_id] }));
      return validated('item', () =>
        store.plannerItems.insert({
          ...body,
          ...instantsOf(body),
          position,
          profile_id: profileId,
          series_id: null,
          original_start: null,
          status: 'open',
          google: null,
          created_by: 'person',
        }),
      );
    }),
  );
}

function updateRoute(context: PlannerContext): RouteOf<'updatePlannerItem'> {
  const { store } = context;
  return bound(E.updatePlannerItem, ({ params, query, body, caller }) => {
    return store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const before = store.plannerItems.byId(params.itemId, profileId);
      requireLinks(store, profileId, body.changes);
      return validated('item', () => editItem(store, profileId, before, body));
    });
  });
}

function deleteRoute(context: PlannerContext): RouteOf<'deletePlannerItem'> {
  const { store } = context;
  return bound(E.deletePlannerItem, ({ params, query, caller }) => {
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const item = store.plannerItems.byId(params.itemId, profileId);
      validated('item', () => {
        deleteItem(store, profileId, item, query);
      });
    });
    return DONE_REPLY;
  });
}

function completeRoute(context: PlannerContext, now: () => Date): RouteOf<'completePlannerItem'> {
  const { store } = context;
  return bound(E.completePlannerItem, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const item = openItemOf(store, profileId, params.itemId, body.occurrence_key);
      const existing = store.plannerOccurrences.find(item.id, body.occurrence_key);
      if (existing?.status === 'done') return existing;
      settled(existing);
      const evidence = body.evidence ?? null;
      const row = store.plannerOccurrences.save({
        ...OPEN_OCCURRENCE,
        item_id: item.id,
        occurrence_key: body.occurrence_key,
        status: 'done',
        completed_at: now().toISOString(),
        completed_by: completerOf(evidence),
        evidence,
      });
      if (item.rrule === null) store.plannerItems.update(item.id, profileId, { status: 'done' });
      return row;
    }),
  );
}

function skipRoute(context: PlannerContext): RouteOf<'skipPlannerItem'> {
  const { store } = context;
  return bound(E.skipPlannerItem, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const item = openItemOf(store, profileId, params.itemId, body.occurrence_key);
      settled(store.plannerOccurrences.find(item.id, body.occurrence_key));
      return store.plannerOccurrences.save({
        ...OPEN_OCCURRENCE,
        item_id: item.id,
        occurrence_key: body.occurrence_key,
        status: 'skipped',
      });
    }),
  );
}

function moveRoute(context: PlannerContext): RouteOf<'movePlannerItem'> {
  const { store } = context;
  return bound(E.movePlannerItem, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const item = openItemOf(store, profileId, params.itemId, body.occurrence_key);
      settled(store.plannerOccurrences.find(item.id, body.occurrence_key));
      return store.plannerOccurrences.save({
        ...OPEN_OCCURRENCE,
        item_id: item.id,
        occurrence_key: body.occurrence_key,
        status: 'missed',
        moved_start: body.start,
        moved_end: body.end,
      });
    }),
  );
}

export const plannerItemRoutes = (context: PlannerContext, now: () => Date) =>
  ({
    createPlannerItem: createRoute(context),
    updatePlannerItem: updateRoute(context),
    deletePlannerItem: deleteRoute(context),
    completePlannerItem: completeRoute(context, now),
    skipPlannerItem: skipRoute(context),
    movePlannerItem: moveRoute(context),
  }) as const;

function createCollectionRoute(context: PlannerContext): RouteOf<'createPlannerCollection'> {
  const { store } = context;
  return bound(E.createPlannerCollection, ({ query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const position = body.position ?? nextPosition(store.plannerCollections.list(profileId));
      return store.plannerCollections.insert({
        ...body,
        position,
        profile_id: profileId,
        source: 'local',
        google: null,
      });
    }),
  );
}

export const plannerCollectionRoutes = (context: PlannerContext) =>
  ({
    createPlannerCollection: createCollectionRoute(context),
    updatePlannerCollection: bound(E.updatePlannerCollection, ({ params, query, body, caller }) =>
      context.store.plannerCollections.update(
        params.collectionId,
        plannerProfileOf(context, caller, query.personId),
        body,
      ),
    ),
    deletePlannerCollection: bound(E.deletePlannerCollection, ({ params, query, caller }) => {
      context.store.plannerCollections.remove(
        params.collectionId,
        plannerProfileOf(context, caller, query.personId),
      );
      return DONE_REPLY;
    }),
  }) as const;
