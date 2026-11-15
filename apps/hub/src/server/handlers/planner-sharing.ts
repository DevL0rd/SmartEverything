import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { respondAsMember } from '../../planner/guests/rsvp';
import { setGuestList } from '../../planner/guests/guest-list';
import { suggestGuests } from '../../planner/guests/suggestions';
import { resolveItem } from '../../planner/sharing/visibility';
import { writes } from '../../planner/sharing/edit-rules';
import { requireSharee, requireShareable } from '../../planner/sharing/shares';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-items';

function shareRoute(context: PlannerContext): RouteOf<'sharePlannerCollection'> {
  const { store } = context;
  return bound(E.sharePlannerCollection, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const collection = requireShareable(store, profileId, params.collectionId);
      requireSharee(store, collection, params.personId);
      return store.plannerShares.save({
        collection_id: collection.id,
        profile_id: params.personId,
        role: body.role,
      });
    }),
  );
}

function changeRoute(context: PlannerContext): RouteOf<'changePlannerShare'> {
  const { store } = context;
  return bound(E.changePlannerShare, ({ params, query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    if (params.personId !== profileId) {
      throw new ApiError('forbidden', 'Only the person a calendar is shared with can change this.');
    }
    return store.plannerShares.change(params.collectionId, profileId, body);
  });
}

function unshareRoute(context: PlannerContext): RouteOf<'unsharePlannerCollection'> {
  const { store } = context;
  return bound(E.unsharePlannerCollection, ({ params, query, caller }) => {
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const collection = store.plannerCollections.anyById(params.collectionId);
      if (collection.profile_id !== profileId && params.personId !== profileId) {
        throw new ApiError('forbidden', 'Only the owner or the person shared with can stop this.');
      }
      store.plannerShares.remove(collection.id, params.personId);
    });
    return DONE_REPLY;
  });
}

function guestsRoute(context: PlannerContext): RouteOf<'setPlannerGuests'> {
  const { store } = context;
  return bound(E.setPlannerGuests, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const { item, role } = resolveItem(store, profileId, params.itemId, 'read');
      if (!writes(role)) throw new ApiError('forbidden', 'You may not change the guests.');
      return setGuestList(store, item, body.guests);
    }),
  );
}

function rsvpRoute(context: PlannerContext, now: () => Date): RouteOf<'respondPlannerInvite'> {
  const { store } = context;
  return bound(E.respondPlannerInvite, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const { item } = resolveItem(store, profileId, params.itemId, 'rsvp');
      return respondAsMember(store, item, profileId, { ...body, at: now().toISOString() });
    }),
  );
}

export const plannerSharingRoutes = (context: PlannerContext, now: () => Date) =>
  ({
    sharePlannerCollection: shareRoute(context),
    changePlannerShare: changeRoute(context),
    unsharePlannerCollection: unshareRoute(context),
    setPlannerGuests: guestsRoute(context),
    respondPlannerInvite: rsvpRoute(context, now),
    suggestPlannerGuests: bound(E.suggestPlannerGuests, ({ query, caller }) =>
      suggestGuests(context.store, plannerProfileOf(context, caller, query.personId), query.text),
    ),
  }) as const;
