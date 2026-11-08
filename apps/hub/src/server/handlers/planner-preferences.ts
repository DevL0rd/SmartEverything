import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { plannerPreferencesOf } from '../../planner/preferences';
import { bound, type RouteOf } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-items';

export type PreferencesChanged = (profileId: string) => void;

function writeRoute(
  context: PlannerContext,
  changed: PreferencesChanged,
): RouteOf<'writePlannerPreferences'> {
  const { store } = context;
  return bound(E.writePlannerPreferences, ({ query, body, caller }) => {
    const profileId = plannerProfileOf(context, caller, query.personId);
    const saved = store.write(() => {
      if (body.tasks.default_collection_id !== null) {
        store.plannerCollections.byId(body.tasks.default_collection_id, profileId);
      }
      return store.plannerPreferences.put(profileId, body).preferences;
    });
    changed(profileId);
    return saved;
  });
}

export const plannerPreferenceRoutes = (context: PlannerContext, changed: PreferencesChanged) =>
  ({
    readPlannerPreferences: bound(E.readPlannerPreferences, ({ query, caller }) =>
      plannerPreferencesOf(context.store, plannerProfileOf(context, caller, query.personId)),
    ),
    writePlannerPreferences: writeRoute(context, changed),
  }) as const;
