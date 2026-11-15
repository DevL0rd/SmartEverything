import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { FeedService } from '../../planner/feeds';
import { isoOf } from '../../planner/instants';
import { searchPlanner } from '../../planner/search';
import { visibleCollections } from '../../planner/sharing/visibility';
import { bound } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-items';

export interface PlannerSearchDependencies {
  readonly now: () => Date;
  readonly feeds: Pick<FeedService, 'registry'>;
}

const YEAR_HOURS = 24 * 366;

export const plannerSearchRoutes = (context: PlannerContext, deps: PlannerSearchDependencies) =>
  ({
    readPlannerSearch: bound(E.readPlannerSearch, ({ query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const now = Temporal.Instant.fromEpochMilliseconds(deps.now().getTime());
      deps.feeds.registry.prepare(visibleCollections(context.store, profileId), {
        from: isoOf(now.subtract({ hours: YEAR_HOURS })),
        to: isoOf(now.add({ hours: YEAR_HOURS })),
      });
      return searchPlanner(context.store, {
        profileId,
        text: query.text,
        now,
        timeZone: context.store.settings.read().time_zone,
        when: query.when,
        collectionIds: query.collections,
        kinds: query.kinds,
        cursor: query.cursor,
      });
    }),
  }) as const;
