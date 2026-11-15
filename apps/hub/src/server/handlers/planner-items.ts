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
import { completeOpenSteps } from '../../planner/completion';
import { instantsOf } from '../../planner/instants';
import { deleteItem, editItem } from '../../planner/series-edit';
import { requireAssignee } from '../../planner/sharing/assignment';
import { requireChange, requireRemoval, writes } from '../../planner/sharing/edit-rules';
import {
  itemRoleOf,
  resolveCollection,
  resolveItem,
  type ItemNeed,
} from '../../planner/sharing/visibility';
import { requireParent, withStepPosition } from '../../planner/steps';
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
  item: PlannerItemRow,
  links: {
    readonly collection_id?: string | undefined;
    readonly parent_id?: string | null | undefined;
  },
): void {
  if (links.collection_id !== undefined) {
    store.plannerCollections.byId(links.collection_id, item.profile_id);
  }
  if (links.parent_id !== undefined && links.parent_id !== null) {
    requireParent(
      store,
      item.profile_id,
      { id: item.id, kind: item.kind, collection_id: links.collection_id ?? item.collection_id },
      links.parent_id,
    );
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

interface OccurrenceRequest {
  readonly profileId: string;
  readonly itemId: string;
  readonly key: string;
  readonly need: ItemNeed;
}

function openItemOf(store: Store, request: OccurrenceRequest): PlannerItemRow {
  const { item } = resolveItem(store, request.profileId, request.itemId, request.need);
  requireKey(item, request.key);
  return item;
}

const OPEN_OCCURRENCE = {
  completed_at: null,
  completed_by: null,
  evidence: null,
  moved_start: null,
  moved_end: null,
} as const;

function ownerOfNew(
  store: Store,
  profileId: string,
  body: {
    readonly kind: PlannerItemRow['kind'];
    readonly collection_id: string;
    readonly parent_id: string | null;
    readonly assignee_id: string | null;
  },
): string {
  if (body.parent_id !== null) {
    const parent = requireParent(
      store,
      profileId,
      { id: null, kind: body.kind, collection_id: body.collection_id },
      body.parent_id,
    );
    const role = itemRoleOf(store, profileId, parent);
    if (body.assignee_id !== null && (role === undefined || !writes(role))) {
      throw new ApiError('forbidden', 'You may not assign steps of this task.');
    }
    return parent.profile_id;
  }
  return resolveCollection(store, profileId, body.collection_id, 'write').profile_id;
}

function createRoute(context: PlannerContext): RouteOf<'createPlannerItem'> {
  const { store } = context;
  return bound(E.createPlannerItem, ({ query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const ownerId = ownerOfNew(store, profileId, body);
      requireAssignee(store, body.kind, body.assignee_id);
      const position =
        body.position ??
        nextPosition(store.plannerItems.list(ownerId, { collectionIds: [body.collection_id] }));
      return validated('item', () =>
        store.plannerItems.insert({
          ...body,
          ...instantsOf(body),
          position,
          profile_id: ownerId,
          series_id: null,
          original_start: null,
          status: 'open',
          google: null,
          ical_uid: null,
          ical_sequence: 0,
          booking_page_id: null,
          created_by: 'person',
        }),
      );
    }),
  );
}

function updateRoute(context: PlannerContext): RouteOf<'updatePlannerItem'> {
  const { store } = context;
  return bound(E.updatePlannerItem, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const { item: before, role } = resolveItem(store, profileId, params.itemId, 'read');
      requireChange(role, before, body.changes);
      requireLinks(store, before, body.changes);
      if (body.changes.assignee_id !== undefined) {
        requireAssignee(store, before.kind, body.changes.assignee_id);
      }
      const changes = withStepPosition(store, before, body.changes);
      return validated('item', () =>
        editItem(store, before.profile_id, before, { ...body, changes }),
      );
    }),
  );
}

function deleteRoute(context: PlannerContext): RouteOf<'deletePlannerItem'> {
  const { store } = context;
  return bound(E.deletePlannerItem, ({ params, query, caller }) => {
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const { item, role } = resolveItem(store, profileId, params.itemId, 'read');
      requireRemoval(role, item);
      validated('item', () => {
        deleteItem(store, item.profile_id, item, query);
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
      const item = openItemOf(store, {
        profileId,
        itemId: params.itemId,
        key: body.occurrence_key,
        need: 'complete',
      });
      const existing = store.plannerOccurrences.find(item.id, body.occurrence_key);
      if (existing?.status === 'done') return existing;
      settled(existing);
      const evidence = body.evidence ?? null;
      const at = now().toISOString();
      const by = completerOf(evidence);
      const row = store.plannerOccurrences.save({
        ...OPEN_OCCURRENCE,
        item_id: item.id,
        occurrence_key: body.occurrence_key,
        status: 'done',
        completed_at: at,
        completed_by: by,
        evidence,
      });
      if (item.rrule === null) {
        const done = store.plannerItems.update(item.id, item.profile_id, { status: 'done' });
        completeOpenSteps(store, done, { at, by, evidence });
      }
      return row;
    }),
  );
}

function skipRoute(context: PlannerContext): RouteOf<'skipPlannerItem'> {
  const { store } = context;
  return bound(E.skipPlannerItem, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const item = openItemOf(store, {
        profileId,
        itemId: params.itemId,
        key: body.occurrence_key,
        need: 'complete',
      });
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

function reopenRoute(context: PlannerContext): RouteOf<'reopenPlannerItem'> {
  const { store } = context;
  return bound(E.reopenPlannerItem, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const item = openItemOf(store, {
        profileId,
        itemId: params.itemId,
        key: body.occurrence_key,
        need: 'complete',
      });
      if (store.plannerOccurrences.find(item.id, body.occurrence_key) !== undefined) {
        store.plannerOccurrences.remove(item.id, body.occurrence_key);
      }
      if (item.rrule === null && item.status === 'done') {
        store.plannerItems.update(item.id, item.profile_id, { status: 'open' });
      }
      return DONE_REPLY;
    }),
  );
}

function moveRoute(context: PlannerContext): RouteOf<'movePlannerItem'> {
  const { store } = context;
  return bound(E.movePlannerItem, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const item = openItemOf(store, {
        profileId,
        itemId: params.itemId,
        key: body.occurrence_key,
        need: 'write',
      });
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
    reopenPlannerItem: reopenRoute(context),
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
        audience: 'personal',
        source: 'local',
        google: null,
        feed: null,
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
