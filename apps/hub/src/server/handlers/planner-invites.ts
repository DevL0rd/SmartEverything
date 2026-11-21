import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { InviteService } from '../../planner/invites/service';
import { writes } from '../../planner/sharing/edit-rules';
import { bound } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-profile';

export interface PlannerInviteServices {
  readonly invites: Pick<InviteService, 'deliver' | 'publicLinkOf'>;
}

export const plannerInviteRoutes = (context: PlannerContext, services: PlannerInviteServices) =>
  ({
    resendPlannerInvite: bound(E.resendPlannerInvite, async ({ params, query, caller }) => {
      const { store } = context;
      const profileId = plannerProfileOf(context, caller, query.personId);
      const { item, role } = await store.host.read('plannerItemResolve', {
        profileId,
        itemId: params.itemId,
        need: 'read',
      });
      if (!writes(role)) throw new ApiError('forbidden', 'You may not change the guests.');
      const guest = await store.host.call('plannerGuests', 'byId', params.guestId);
      if (guest.item_id !== item.id || guest.kind !== 'email') {
        throw new ApiError('not_found', 'That guest does not exist.');
      }
      return services.invites.deliver(guest.id, 'invite');
    }),
    plannerInviteLink: bound(E.plannerInviteLink, async ({ params, query, caller }) => {
      const { store } = context;
      const profileId = plannerProfileOf(context, caller, query.personId);
      const { item, role } = await store.host.read('plannerItemResolve', {
        profileId,
        itemId: params.itemId,
        need: 'read',
      });
      if (!writes(role)) throw new ApiError('forbidden', 'You may not change the guests.');
      const guest = await store.host.call('plannerGuests', 'byId', params.guestId);
      if (guest.item_id !== item.id || guest.kind !== 'email') {
        throw new ApiError('not_found', 'That guest does not exist.');
      }
      return { url: services.invites.publicLinkOf(guest.id) };
    }),
  }) as const;
