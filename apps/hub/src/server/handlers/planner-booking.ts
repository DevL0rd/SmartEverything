import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { DONE_REPLY, bound } from '../router';
import { plannerProfileFor, type PlannerContext } from './planner-profile';

export const plannerBookingRoutes = (context: PlannerContext) =>
  ({
    listPlannerBookingPages: bound(E.listPlannerBookingPages, async ({ query, caller }) =>
      context.store.host.call(
        'plannerBookingPages',
        'list',
        await plannerProfileFor(context, caller, query.personId),
      ),
    ),
    createPlannerBookingPage: bound(E.createPlannerBookingPage, ({ caller, query, body, params }) =>
      context.store.host.write('plannerBookingCreate', { caller, query, body, params }),
    ),
    updatePlannerBookingPage: bound(E.updatePlannerBookingPage, ({ caller, query, body, params }) =>
      context.store.host.write('plannerBookingUpdate', { caller, query, body, params }),
    ),
    deletePlannerBookingPage: bound(
      E.deletePlannerBookingPage,
      async ({ caller, query, body, params }) => {
        await context.store.host.write('plannerBookingDelete', { caller, query, body, params });
        return DONE_REPLY;
      },
    ),
    resetPlannerBookingLink: bound(E.resetPlannerBookingLink, async ({ params, query, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      return context.store.host.call('plannerBookingPages', 'resetToken', params.pageId, profileId);
    }),
  }) as const;
