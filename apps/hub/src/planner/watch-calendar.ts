import { createHash } from 'node:crypto';
import type { PlannerPreferences, WatchCalendarEvent } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { PendingWork } from './pending-work';
import { isWatchDevice, type WatchChannel } from './watch-projection';

export type WatchCalendarStore = Pick<Store, 'host' | 'feed'>;

export interface WatchCalendarOptions {
  readonly store: WatchCalendarStore;
  readonly channel: WatchChannel;
  readonly profileOf: (deviceId: string) => Promise<string | null>;
  readonly preferences: (profileId: string) => Promise<PlannerPreferences>;
  readonly refresh: (profileId: string) => Promise<void>;
  readonly now: () => Date;
  readonly log: Logger;
}

export class WatchCalendar {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly sent = new Map<string, string>();
  private unsubscribe: (() => void) | null = null;
  private readonly work = new PendingWork('planner.watch_calendar_failed');

  constructor(private readonly options: WatchCalendarOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'planner_items' || change.table === 'planner_collections') {
        this.changed(change.record?.profile_id ?? change.oldRecord?.profile_id ?? null);
      } else if (change.table === 'planner_occurrences') {
        this.changedForAll();
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async settled(): Promise<void> {
    await this.work.settled();
    await Promise.all([...this.tails.values()]);
  }

  connected(deviceId: string): void {
    this.work.run(this.connectedWatch(deviceId));
  }

  private async connectedWatch(deviceId: string): Promise<void> {
    const profileId = await this.options.profileOf(deviceId);
    if (profileId !== null) this.enqueue(profileId, [deviceId], true);
  }

  preferencesChanged(profileId: string): void {
    this.enqueue(profileId, null, true);
  }

  private changed(profileId: string | null): void {
    if (profileId !== null) this.enqueue(profileId, null, false);
  }

  private changedForAll(): void {
    this.work.run(this.changedForWatches());
  }

  private async changedForWatches(): Promise<void> {
    const profiles = new Set<string>();
    for (const device of await this.options.store.host.call('devices', 'list')) {
      const profileId = isWatchDevice(device) ? await this.options.profileOf(device.id) : null;
      if (profileId !== null) profiles.add(profileId);
    }
    for (const profileId of profiles) this.changed(profileId);
  }

  private async watchesOf(profileId: string): Promise<string[]> {
    const watches: string[] = [];
    for (const device of await this.options.store.host.call('devices', 'list')) {
      if (isWatchDevice(device) && (await this.options.profileOf(device.id)) === profileId) {
        watches.push(device.id);
      }
    }
    return watches;
  }

  private enqueue(profileId: string, deviceIds: readonly string[] | null, force: boolean): void {
    const next = (this.tails.get(profileId) ?? Promise.resolve()).then(() =>
      this.pushWanted(profileId, deviceIds, force),
    );
    this.tails.set(
      profileId,
      next.then(undefined, (cause: unknown) => {
        this.options.log.error('planner.watch_calendar_failed', cause, { profileId });
      }),
    );
  }

  private async pushWanted(
    profileId: string,
    deviceIds: readonly string[] | null,
    force: boolean,
  ): Promise<void> {
    const watches = deviceIds ?? (await this.watchesOf(profileId));
    if (watches.length === 0) return;
    if (!(await this.options.preferences(profileId)).watch.watch_calendar_push) return;
    await this.push(profileId, watches, force);
  }

  private async push(
    profileId: string,
    deviceIds: readonly string[],
    force: boolean,
  ): Promise<void> {
    await this.options.refresh(profileId);
    const events: WatchCalendarEvent[] = await this.options.store.host.read('plannerWatchEvents', {
      profileId,
      nowMs: this.options.now().getTime(),
    });
    const digest = createHash('sha256').update(JSON.stringify(events)).digest('hex');
    for (const deviceId of deviceIds) {
      if (!force && this.sent.get(deviceId) === digest) continue;
      const outcome = await this.options.channel.send(deviceId, { type: 'set_calendar', events });
      if (outcome.ok) {
        this.sent.set(deviceId, digest);
      } else {
        this.sent.delete(deviceId);
        this.options.log.warn('planner.watch_calendar_unsent', {
          deviceId,
          detail: outcome.detail,
        });
      }
    }
  }
}
