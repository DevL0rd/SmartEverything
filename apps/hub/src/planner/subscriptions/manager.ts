import type { PlannerCollectionRow } from '@smarteverything/domain';
import {
  FeedSubscription,
  icsFeedOf,
  type SubscriptionDeps,
  type SubscriptionStore,
} from './subscription';

export class FeedSubscriptions {
  private readonly active = new Map<string, FeedSubscription>();
  private stopListening: (() => void) | null = null;

  constructor(private readonly deps: SubscriptionDeps) {}

  private get store(): SubscriptionStore {
    return this.deps.store;
  }

  start(): void {
    for (const collection of this.store.plannerCollections.feeds('ics')) this.watch(collection);
    this.stopListening = this.store.feed.subscribe((change) => {
      if (change.table !== 'planner_collections') return;
      if (change.record === null) this.release(change.oldRecord?.id);
      else if (change.record.feed?.kind === 'ics') this.changed(change.record, change.oldRecord);
    });
  }

  stop(): void {
    this.stopListening?.();
    this.stopListening = null;
    for (const subscription of this.active.values()) subscription.cancel();
    this.active.clear();
  }

  refresh(collectionId: string): Promise<PlannerCollectionRow> {
    const collection = this.store.plannerCollections.anyById(collectionId);
    icsFeedOf(collection);
    return this.watch(collection, false).refresh();
  }

  private watch(collection: PlannerCollectionRow, arm = true): FeedSubscription {
    const known = this.active.get(collection.id);
    if (known !== undefined) return known;
    const subscription = new FeedSubscription(this.deps, collection.id);
    this.active.set(collection.id, subscription);
    if (arm) subscription.arm(collection);
    return subscription;
  }

  private release(collectionId: string | undefined): void {
    if (collectionId === undefined) return;
    this.active.get(collectionId)?.cancel();
    this.active.delete(collectionId);
  }

  private changed(collection: PlannerCollectionRow, before: PlannerCollectionRow | null): void {
    const feed = icsFeedOf(collection);
    const was = before?.feed?.kind === 'ics' ? before.feed : null;
    if (was === null) {
      this.watch(collection);
    } else if (was.url !== feed.url || was.refresh_minutes !== feed.refresh_minutes) {
      this.release(collection.id);
      this.watch(collection);
    }
  }
}
