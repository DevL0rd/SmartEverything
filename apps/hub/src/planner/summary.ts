import type { LiveChange, PlannerSummary } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { Coalesced } from '../store/reader';
import type { Store } from '../store/store';
import { PendingWork } from './pending-work';

export type SummaryStore = Pick<Store, 'host' | 'feed'>;

export interface SummaryDeskOptions {
  readonly store: SummaryStore;
  readonly clock: Pick<Clock, 'now'>;
  readonly log: Logger;
}

export async function profilesOfItem(store: SummaryStore, itemId: string): Promise<string[]> {
  return store.host.read('plannerItemViewers', { itemId });
}

export class SummaryDesk {
  private readonly published = new Map<string, string>();
  private readonly refreshing = new Map<string, Coalesced>();
  private readonly unsubscribe: (() => void)[] = [];
  private running = false;
  private readonly work = new PendingWork('planner.summary_failed');

  constructor(private readonly options: SummaryDeskOptions) {}

  async start(): Promise<void> {
    this.running = true;
    const { feed } = this.options.store;
    this.unsubscribe.push(
      feed.subscribe((change) => {
        this.work.run(this.follow(change));
      }),
      feed.subscribeNotices((notice) => {
        if (notice.type === 'planner_ring') this.work.run(this.refreshAll());
      }),
    );
    await this.refreshAll();
  }

  stop(): void {
    this.running = false;
    for (const off of this.unsubscribe.splice(0)) off();
    for (const run of this.refreshing.values()) background(run.stop(), 'planner.summary_failed');
    this.refreshing.clear();
    this.published.clear();
  }

  summaryOf(profileId: string): Promise<PlannerSummary> {
    return this.options.store.host.read('plannerSummary', {
      profileId,
      nowMs: this.options.clock.now().getTime(),
    });
  }

  async refresh(profileId: string): Promise<void> {
    if (!this.running) return;
    const run =
      this.refreshing.get(profileId) ??
      new Coalesced(
        () => this.publish(profileId),
        (cause) => {
          this.options.log.error('planner.summary_failed', cause, { profileId });
        },
      );
    this.refreshing.set(profileId, run);
    run.trigger();
    await run.idle();
  }

  async refreshAll(): Promise<void> {
    const profiles = await this.options.store.host.call('profiles', 'list');
    await Promise.all(profiles.map((profile) => this.refresh(profile.id)));
  }

  async settled(): Promise<void> {
    await this.work.settled();
    await Promise.all([...this.refreshing.values()].map((run) => run.idle()));
  }

  private async publish(profileId: string): Promise<void> {
    const summary = await this.summaryOf(profileId);
    if (!this.running) return;
    const text = JSON.stringify(summary);
    if (this.published.get(profileId) === text) return;
    this.published.set(profileId, text);
    this.options.store.feed.notice({ type: 'planner_summary', ...summary });
    this.options.log.debug('planner.summary_published', { profileId });
  }

  private async follow(change: LiveChange): Promise<void> {
    if (change.table === 'settings') await this.refreshAll();
    else if (change.table === 'planner_occurrences') {
      await this.followOccurrence(change.record ?? change.oldRecord);
    } else if (change.table === 'planner_items') {
      if (change.record === null) await this.refreshAll();
      else await this.refreshSeeing(change.record.id, change.record.profile_id);
    } else if (change.table === 'planner_guests') {
      const row = change.record ?? change.oldRecord;
      if (row !== null) await this.refreshSeeing(row.item_id, null);
    } else {
      await this.followOwned(change);
    }
  }

  private async followOwned(change: LiveChange): Promise<void> {
    if (
      change.table !== 'planner_collection_shares' &&
      change.table !== 'planner_alarms' &&
      change.table !== 'planner_timers'
    ) {
      return;
    }
    const row = change.record ?? change.oldRecord;
    if (row !== null) await this.refresh(row.profile_id);
  }

  private async refreshSeeing(itemId: string, owner: string | null): Promise<void> {
    const seeing = new Set([
      ...(await profilesOfItem(this.options.store, itemId)),
      ...(owner === null ? [] : [owner]),
    ]);
    if (seeing.size === 0) await this.refreshAll();
    else await Promise.all([...seeing].map((profileId) => this.refresh(profileId)));
  }

  private async followOccurrence(row: { readonly item_id: string } | null): Promise<void> {
    if (row === null) await this.refreshAll();
    else await this.refreshSeeing(row.item_id, null);
  }
}
