import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { pageOf, requireBookable } from '../../planner/booking/pages';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-items';

function createRoute(context: PlannerContext): RouteOf<'createPlannerBookingPage'> {
  const { store } = context;
  return bound(E.createPlannerBookingPage, ({ query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      requireBookable(store, profileId, body.collection_id);
      return store.plannerBookingPages.insert(profileId, body);
    }),
  );
}

function updateRoute(context: PlannerContext): RouteOf<'updatePlannerBookingPage'> {
  const { store } = context;
  return bound(E.updatePlannerBookingPage, ({ params, query, body, caller }) =>
    store.write(() => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      if (body.collection_id !== undefined) requireBookable(store, profileId, body.collection_id);
      return store.plannerBookingPages.update(params.pageId, profileId, body);
    }),
  );
}

export const plannerBookingRoutes = (context: PlannerContext) =>
  ({
    listPlannerBookingPages: bound(E.listPlannerBookingPages, ({ query, caller }) =>
      context.store.plannerBookingPages.list(plannerProfileOf(context, caller, query.personId)),
    ),
    createPlannerBookingPage: createRoute(context),
    updatePlannerBookingPage: updateRoute(context),
    deletePlannerBookingPage: bound(E.deletePlannerBookingPage, ({ params, query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      context.store.plannerBookingPages.remove(
        pageOf(context.store, profileId, params.pageId).id,
        profileId,
      );
      return DONE_REPLY;
    }),
    resetPlannerBookingLink: bound(E.resetPlannerBookingLink, ({ params, query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      return context.store.plannerBookingPages.resetToken(params.pageId, profileId);
    }),
  }) as const;
