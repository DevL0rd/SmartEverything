import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { FeedService } from '../../planner/feeds';
import { isoOf } from '../../planner/instants';
import { bound } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-profile';

export interface PlannerSearchDependencies {
  readonly now: () => Date;
  readonly feeds: Pick<FeedService, 'registry'>;
}

const YEAR_HOURS = 24 * 366;

export const plannerSearchRoutes = (context: PlannerContext, deps: PlannerSearchDependencies) =>
  ({
    readPlannerSearch: bound(E.readPlannerSearch, async ({ query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const now = Temporal.Instant.fromEpochMilliseconds(deps.now().getTime());
      const { host } = context.store;
      await deps.feeds.registry.prepare(
        await host.read('plannerVisibleCollections', { profileId }),
        {
          from: isoOf(now.subtract({ hours: YEAR_HOURS })),
          to: isoOf(now.add({ hours: YEAR_HOURS })),
        },
      );
      return host.read('plannerSearchView', {
        profileId,
        text: query.text,
        nowMs: now.epochMilliseconds,
        timeZone: context.store.settings.read().time_zone,
        when: query.when,
        collectionIds: query.collections,
        kinds: query.kinds,
        cursor: query.cursor,
      });
    }),
  }) as const;
