import type {
  PlannerCollectionRow,
  PlannerFeedCreate,
  PlannerFeedKind,
} from '@smarteverything/domain';
import type { PLANNER_FEED_CHANGES } from '@smarteverything/domain';
import type { z } from 'zod';

export type PlannerFeedChanges = z.infer<typeof PLANNER_FEED_CHANGES>;

export interface FeedWindow {
  readonly from: string;
  readonly to: string;
}

export interface FeedCreateRequest {
  readonly profileId: string;
  readonly input: PlannerFeedCreate;
}

export interface FeedKindHandler {
  readonly kind: PlannerFeedKind;
  readonly create: (request: FeedCreateRequest) => Promise<PlannerCollectionRow>;
  readonly update: (
    collection: PlannerCollectionRow,
    changes: PlannerFeedChanges,
  ) => Promise<PlannerCollectionRow>;
  readonly refresh: (collection: PlannerCollectionRow) => Promise<PlannerCollectionRow>;
  readonly prepare: (collection: PlannerCollectionRow, window: FeedWindow) => Promise<void>;
}

export class FeedKindUnavailableError extends Error {
  override readonly name = 'FeedKindUnavailableError';

  constructor(readonly kind: PlannerFeedKind) {
    super(`This hub has no ${kind} calendars.`);
  }
}

export class FeedRegistry {
  private readonly handlers = new Map<PlannerFeedKind, FeedKindHandler>();

  register(handler: FeedKindHandler): void {
    this.handlers.set(handler.kind, handler);
  }

  of(kind: PlannerFeedKind): FeedKindHandler {
    const handler = this.handlers.get(kind);
    if (handler === undefined) throw new FeedKindUnavailableError(kind);
    return handler;
  }

  async prepare(collections: readonly PlannerCollectionRow[], window: FeedWindow): Promise<void> {
    await Promise.all(
      collections.flatMap((collection) =>
        collection.feed === null ? [] : [this.of(collection.feed.kind).prepare(collection, window)],
      ),
    );
  }
}
