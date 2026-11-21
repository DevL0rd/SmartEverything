import {
  type DeviceRow,
  type PlannerAlarmRow,
  type PlannerPreferences,
  type PlannerWatchLink,
  type WatchAlarm,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { PendingWork } from './pending-work';
import {
  DevicePass,
  IMPORTED_SMART_MINUTES,
  aimsAt,
  alarmsOnWatch,
  isWatchDevice,
  linkOf,
  plannerDaysOf,
  sameLink,
  synced,
  watchHash,
  type PassInput,
  type Settled,
  type WatchChannel,
} from './watch-projection';

export type WatchSyncStore = Pick<Store, 'host' | 'feed'>;

export interface WatchSyncOptions {
  readonly store: WatchSyncStore;
  readonly channel: WatchChannel;
  readonly profileOf: (deviceId: string) => Promise<string | null>;
  readonly preferences: (profileId: string) => Promise<PlannerPreferences>;
  readonly log: Logger;
}

type Trigger =
  | { readonly kind: 'alarm'; readonly alarmId: string }
  | { readonly kind: 'watch' }
  | { readonly kind: 'connected' };

function contentChanged(record: PlannerAlarmRow, before: PlannerAlarmRow): boolean {
  const strip = (alarm: PlannerAlarmRow): string =>
    JSON.stringify({ ...alarm, watch: [], updated_at: '' });
  return strip(record) !== strip(before);
}

export class WatchSync {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly gone = new Map<string, Set<number>>();
  private unsubscribe: (() => void) | null = null;
  private readonly work = new PendingWork('planner.watch_sync_failed');

  constructor(private readonly options: WatchSyncOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'planner_alarms') {
        this.alarmChanged(change.record, change.oldRecord);
      } else if (change.table === 'devices' && change.record !== null) {
        this.deviceChanged(change.record, change.oldRecord);
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
    this.run(deviceId, { kind: 'connected' });
  }

  preferencesChanged(profileId: string): void {
    this.work.run(this.resyncProfile(profileId), { profileId });
  }

  private async resyncProfile(profileId: string): Promise<void> {
    for (const device of await this.options.store.host.call('devices', 'list')) {
      if (isWatchDevice(device) && (await this.options.profileOf(device.id)) === profileId) {
        this.run(device.id, { kind: 'connected' });
      }
    }
  }

  private alarmChanged(record: PlannerAlarmRow | null, before: PlannerAlarmRow | null): void {
    if (record === null) {
      if (before !== null) this.removed(before);
      return;
    }
    if (before !== null && !contentChanged(record, before)) {
      return;
    }
    this.work.run(this.runFor(record, before), { alarmId: record.id });
  }

  private async runFor(record: PlannerAlarmRow, before: PlannerAlarmRow | null): Promise<void> {
    for (const deviceId of await this.devicesOf(record, before)) {
      this.run(deviceId, { kind: 'alarm', alarmId: record.id });
    }
  }

  private async devicesOf(
    record: PlannerAlarmRow,
    before: PlannerAlarmRow | null,
  ): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const alarm of before === null ? [record] : [record, before]) {
      for (const link of alarm.watch) ids.add(link.deviceId);
      for (const target of alarm.targets) {
        if (target.kind === 'device') ids.add(target.deviceId);
      }
    }
    const devices = await Promise.all(
      [...ids].map((id) => this.options.store.host.call('devices', 'find', id)),
    );
    return new Set(
      devices.flatMap((device) =>
        device !== undefined && isWatchDevice(device) ? [device.id] : [],
      ),
    );
  }

  private deviceChanged(record: DeviceRow, before: DeviceRow | null): void {
    if (!isWatchDevice(record)) return;
    const now = JSON.stringify(alarmsOnWatch(record));
    if (before === null || now !== JSON.stringify(alarmsOnWatch(before))) {
      this.run(record.id, { kind: 'watch' });
    }
  }

  private removed(alarm: PlannerAlarmRow): void {
    for (const link of alarm.watch) {
      const { alarmId } = link;
      if (alarmId === null) continue;
      this.enqueue(link.deviceId, 'planner.watch_alarm_delete_failed', async () => {
        await this.deleteFromWatch(link.deviceId, alarmId);
      });
    }
  }

  private async deleteFromWatch(deviceId: string, alarmId: number): Promise<void> {
    const profileId = await this.options.profileOf(deviceId);
    if (profileId === null || !(await this.options.preferences(profileId)).watch.watch_alarm_sync)
      return;
    const goneIds = this.gone.get(deviceId) ?? new Set<number>();
    goneIds.add(alarmId);
    this.gone.set(deviceId, goneIds);
    const outcome = await this.options.channel.send(deviceId, {
      type: 'delete_alarm',
      id: alarmId,
    });
    if (!outcome.ok) {
      this.options.log.warn('planner.watch_alarm_delete_unsent', {
        deviceId,
        alarmId,
        detail: outcome.detail,
      });
    }
  }

  private run(deviceId: string, trigger: Trigger): void {
    this.enqueue(deviceId, 'planner.watch_sync_failed', () => this.reconcile(deviceId, trigger));
  }

  private enqueue(deviceId: string, event: string, task: () => Promise<void>): void {
    const next = (this.tails.get(deviceId) ?? Promise.resolve()).then(task);
    this.tails.set(
      deviceId,
      next.then(undefined, (cause: unknown) => {
        this.options.log.error(event, cause, { deviceId });
      }),
    );
  }

  private async reconcile(deviceId: string, trigger: Trigger): Promise<void> {
    const { host } = this.options.store;
    const device = await host.call('devices', 'find', deviceId);
    const profileId = await this.options.profileOf(deviceId);
    if (device === undefined || !isWatchDevice(device) || profileId === null) return;
    const preferences = await this.options.preferences(profileId);
    if (!preferences.watch.watch_alarm_sync) return;
    const related = (await host.call('plannerAlarms', 'list', profileId)).filter(
      (alarm) => aimsAt(alarm, deviceId) || linkOf(alarm.watch, deviceId) !== undefined,
    );
    const watchAlarms = alarmsOnWatch(device);
    if (watchAlarms === null) {
      await this.waiting(deviceId, profileId, related);
      return;
    }
    const pass = new DevicePass(
      this.options.channel,
      this.inputOf(deviceId, trigger, watchAlarms, related),
    );
    for (const alarm of related) {
      const settled = await pass.settle(alarm, linkOf(alarm.watch, deviceId));
      if (settled !== null) await this.apply(alarm, deviceId, settled);
    }
    await this.importRest(pass.leftOnWatch(), deviceId, profileId, preferences);
  }

  private inputOf(
    deviceId: string,
    trigger: Trigger,
    watchAlarms: readonly WatchAlarm[],
    related: readonly PlannerAlarmRow[],
  ): PassInput {
    const onWatch = new Set(watchAlarms.flatMap((alarm) => (alarm.id === null ? [] : [alarm.id])));
    const gone = new Set([...(this.gone.get(deviceId) ?? [])].filter((id) => onWatch.has(id)));
    this.gone.set(deviceId, gone);
    const claimed = new Set(
      related.flatMap((alarm) => {
        const id = linkOf(alarm.watch, deviceId)?.alarmId;
        return id === null || id === undefined ? [] : [id];
      }),
    );
    return {
      deviceId,
      retries: (alarmId) =>
        trigger.kind === 'connected' || (trigger.kind === 'alarm' && trigger.alarmId === alarmId),
      force: trigger.kind === 'connected',
      watchAlarms,
      claimed,
      gone,
    };
  }

  private async waiting(
    deviceId: string,
    profileId: string,
    related: readonly PlannerAlarmRow[],
  ): Promise<void> {
    for (const alarm of related.filter((candidate) => aimsAt(candidate, deviceId))) {
      const link = linkOf(alarm.watch, deviceId);
      const next: PlannerWatchLink = {
        deviceId,
        alarmId: link?.alarmId ?? null,
        hash: link?.hash ?? null,
        state: 'pending',
        detail: 'Waiting for the watch to report its alarms.',
      };
      if (link === undefined || !sameLink(link, next)) {
        await this.apply(alarm, deviceId, { link: next, fields: {} });
      }
    }
    this.options.log.info('planner.watch_sync_waiting', { deviceId, profileId });
  }

  private async apply(alarm: PlannerAlarmRow, deviceId: string, settled: Settled): Promise<void> {
    const applied = await this.options.store.host.write('plannerWatchLinkApply', {
      alarmId: alarm.id,
      profileId: alarm.profile_id,
      deviceId,
      settled,
    });
    if (applied === null) return;
    this.options.log.info('planner.watch_alarm_settled', {
      alarmId: alarm.id,
      deviceId,
      state: settled.link?.state ?? 'removed',
    });
  }

  private async importRest(
    left: readonly WatchAlarm[],
    deviceId: string,
    profileId: string,
    preferences: PlannerPreferences,
  ): Promise<void> {
    const { clock } = preferences;
    for (const watched of left) {
      if (watched.id === null) continue;
      await this.options.store.host.call('plannerAlarms', 'insert', {
        profile_id: profileId,
        label: null,
        time: watched.time,
        days: plannerDaysOf(watched.days),
        once_on: null,
        skip_on: null,
        enabled: watched.enabled,
        sound: clock.sound,
        ramp_seconds: clock.ramp_seconds,
        vibrate: true,
        snooze_minutes: clock.snooze_minutes,
        snooze_limit: clock.snooze_limit,
        challenge: { kind: 'none' },
        sunrise: null,
        smart_minutes: watched.smart ? IMPORTED_SMART_MINUTES : null,
        wake_automation_id: null,
        wake_lead_minutes: null,
        targets: [{ kind: 'device', deviceId }],
        watch: [synced(deviceId, watched.id, watchHash(watched))],
        source: 'watch',
      });
      this.options.log.info('planner.watch_alarm_imported', { deviceId, watchAlarmId: watched.id });
    }
  }
}
