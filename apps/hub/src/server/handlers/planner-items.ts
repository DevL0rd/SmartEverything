import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { DONE_REPLY, bound } from '../router';
import type { PlannerContext } from './planner-profile';

export const plannerItemRoutes = ({ store }: PlannerContext) =>
  ({
    createPlannerItem: bound(E.createPlannerItem, ({ caller, query, body, params }) =>
      store.host.write('plannerItemCreate', { caller, query, body, params }),
    ),
    updatePlannerItem: bound(E.updatePlannerItem, ({ caller, query, body, params }) =>
      store.host.write('plannerItemUpdate', { caller, query, body, params }),
    ),
    deletePlannerItem: bound(E.deletePlannerItem, async ({ caller, query, body, params }) => {
      await store.host.write('plannerItemDelete', { caller, query, body, params });
      return DONE_REPLY;
    }),
    completePlannerItem: bound(E.completePlannerItem, ({ caller, query, body, params }) =>
      store.host.write('plannerItemComplete', { caller, query, body, params }),
    ),
    skipPlannerItem: bound(E.skipPlannerItem, ({ caller, query, body, params }) =>
      store.host.write('plannerItemSkip', { caller, query, body, params }),
    ),
    reopenPlannerItem: bound(E.reopenPlannerItem, async ({ caller, query, body, params }) => {
      await store.host.write('plannerItemReopen', { caller, query, body, params });
      return DONE_REPLY;
    }),
    movePlannerItem: bound(E.movePlannerItem, ({ caller, query, body, params }) =>
      store.host.write('plannerItemMove', { caller, query, body, params }),
    ),
  }) as const;

export const plannerCollectionRoutes = ({ store }: PlannerContext) =>
  ({
    createPlannerCollection: bound(E.createPlannerCollection, ({ caller, query, body, params }) =>
      store.host.write('plannerCollectionCreate', { caller, query, body, params }),
    ),
    updatePlannerCollection: bound(E.updatePlannerCollection, ({ caller, query, body, params }) =>
      store.host.write('plannerCollectionUpdate', { caller, query, body, params }),
    ),
    deletePlannerCollection: bound(
      E.deletePlannerCollection,
      async ({ caller, query, body, params }) => {
        await store.host.write('plannerCollectionDelete', { caller, query, body, params });
        return DONE_REPLY;
      },
    ),
  }) as const;
