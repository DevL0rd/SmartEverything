import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { DONE_REPLY, bound } from '../router';
import { plannerProfileFor, type PlannerContext } from './planner-profile';

export const plannerSharingRoutes = (context: PlannerContext, now: () => Date) =>
  ({
    sharePlannerCollection: bound(E.sharePlannerCollection, ({ caller, query, body, params }) =>
      context.store.host.write('plannerShare', { caller, query, body, params }),
    ),
    changePlannerShare: bound(E.changePlannerShare, async ({ params, query, body, caller }) => {
      const profileId = await plannerProfileFor(context, caller, query.personId);
      if (params.personId !== profileId) {
        throw new ApiError(
          'forbidden',
          'Only the person a calendar is shared with can change this.',
        );
      }
      return context.store.host.call(
        'plannerShares',
        'change',
        params.collectionId,
        profileId,
        body,
      );
    }),
    unsharePlannerCollection: bound(
      E.unsharePlannerCollection,
      async ({ caller, query, body, params }) => {
        await context.store.host.write('plannerUnshare', { caller, query, body, params });
        return DONE_REPLY;
      },
    ),
    setPlannerGuests: bound(E.setPlannerGuests, ({ caller, query, body, params }) =>
      context.store.host.write('plannerGuestsSet', { caller, query, body, params }),
    ),
    respondPlannerInvite: bound(E.respondPlannerInvite, ({ caller, query, body, params }) =>
      context.store.host.write('plannerRsvp', {
        caller,
        query,
        body,
        params,
        at: now().toISOString(),
      }),
    ),
    suggestPlannerGuests: bound(E.suggestPlannerGuests, ({ caller, query, body, params }) =>
      context.store.host.read('plannerGuestSuggestions', { caller, query, body, params }),
    ),
  }) as const;
