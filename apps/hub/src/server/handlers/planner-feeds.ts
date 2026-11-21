import {
  API_ENDPOINTS as E,
  ApiError,
  PLANNER_FEED_PATHS,
  buildPath,
  type PlannerCollectionRow,
  type PlannerExportLink,
} from '@smarteverything/domain';
import { shareOriginOf } from '../../drive/shares';
import type { FeedKindHandler } from '../../planner/feeds/registry';
import type { FeedService } from '../../planner/feeds';
import type { PlannerExportLinkRow } from '../../store/repositories/planner-export-links';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';
import { plannerProfileOf, type PlannerContext } from './planner-profile';

export interface FeedOrigin {
  readonly url: string;
  readonly public: boolean;
}

export interface PlannerFeedServices {
  readonly feeds: Pick<FeedService, 'registry'>;
  readonly origin: () => FeedOrigin;
}

export function feedOriginOf(
  context: Pick<ServerContext, 'connections' | 'store'>,
): () => FeedOrigin {
  return () => {
    const lan = context.connections
      ?.metadata()
      .endpoints.find((endpoint) => endpoint.kind === 'lan');
    const origin = shareOriginOf(context.store, lan?.url ?? '');
    if (origin.url === '') {
      throw new ApiError(
        'conflict',
        'The hub has no home network address yet, so no feed address can be made.',
      );
    }
    return origin;
  };
}

function handlerOf(
  feeds: PlannerFeedServices['feeds'],
  collection: PlannerCollectionRow,
): FeedKindHandler {
  if (collection.feed === null) {
    throw new ApiError('invalid_request', 'This calendar is not a feed or a subscription.');
  }
  return feeds.registry.of(collection.feed.kind);
}

export function exportLinkOf(row: PlannerExportLinkRow, origin: FeedOrigin): PlannerExportLink {
  const path = buildPath(PLANNER_FEED_PATHS.publishedFeed, { file: `${row.token}.ics` });
  return {
    collection_id: row.collection_id,
    token: row.token,
    url: `${origin.url.replace(/\/+$/, '')}${path}`,
    reach: origin.public ? 'public' : 'home',
    created_at: row.created_at,
  };
}

function editable(
  context: PlannerContext,
  profileId: string,
  collectionId: string,
): Promise<PlannerCollectionRow> {
  return context.store.host.read('plannerFeedCollection', {
    profileId,
    collectionId,
    need: 'edit',
  });
}

export const plannerFeedRoutes = (context: PlannerContext, services: PlannerFeedServices) =>
  ({
    createPlannerFeed: bound(E.createPlannerFeed, ({ query, body, caller }) =>
      services.feeds.registry
        .of(body.kind)
        .create({ profileId: plannerProfileOf(context, caller, query.personId), input: body }),
    ),
    updatePlannerFeed: bound(E.updatePlannerFeed, async ({ params, query, body, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const collection = await editable(context, profileId, params.collectionId);
      return handlerOf(services.feeds, collection).update(collection, body);
    }),
    refreshPlannerFeed: bound(E.refreshPlannerFeed, async ({ params, query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const collection = await editable(context, profileId, params.collectionId);
      return handlerOf(services.feeds, collection).refresh(collection);
    }),
    readPlannerExportLink: bound(E.readPlannerExportLink, async ({ params, query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const collection = await editable(context, profileId, params.collectionId);
      const row = await context.store.host.call('plannerExportLinks', 'find', collection.id);
      return row === undefined ? null : exportLinkOf(row, services.origin());
    }),
    createPlannerExportLink: bound(E.createPlannerExportLink, async ({ params, query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const collection = await editable(context, profileId, params.collectionId);
      return exportLinkOf(
        await context.store.host.call('plannerExportLinks', 'publish', collection.id),
        services.origin(),
      );
    }),
    deletePlannerExportLink: bound(E.deletePlannerExportLink, async ({ params, query, caller }) => {
      const profileId = plannerProfileOf(context, caller, query.personId);
      const collection = await editable(context, profileId, params.collectionId);
      await context.store.host.call('plannerExportLinks', 'remove', collection.id);
      return DONE_REPLY;
    }),
  }) as const;
