import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { loadPlannerPreferences } from '../../planner/preferences';
import { bound } from '../router';
import { plannerProfileFor, type PlannerContext } from './planner-profile';

export type PreferencesChanged = (profileId: string) => void;

export const plannerPreferenceRoutes = (context: PlannerContext, changed: PreferencesChanged) =>
  ({
    readPlannerPreferences: bound(E.readPlannerPreferences, async ({ query, caller }) =>
      loadPlannerPreferences(
        context.store,
        await plannerProfileFor(context, caller, query.personId),
      ),
    ),
    writePlannerPreferences: bound(
      E.writePlannerPreferences,
      async ({ caller, query, body, params }) => {
        const saved = await context.store.host.write('plannerPreferencesWrite', {
          caller,
          query,
          body,
          params,
        });
        changed(saved.profileId);
        return saved.preferences;
      },
    ),
  }) as const;
