import { SCENE_ACTIONS, type DeviceRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { GoogleSyncRunner } from '../google/sync-runner';
import type { RunningHub } from '../hub';
import type { WatchOutcome } from '../local/watch-actions';
import { clientIdOfPhone } from '../phones/phone-device';
import type { Store } from '../store/store';
import { AlarmScheduler } from './alarms';
import { CompletionWatcher } from './completion';
import { PhoneRings, type PhoneRingChannel } from './phone-rings';
import { plannerPreferencesOf } from './preferences';
import { ReminderScheduler } from './reminders';
import { RingDesk } from './rings';
import { StopwatchService } from './stopwatch';
import { SummaryDesk } from './summary';
import { TimerService } from './timers';
import { WakeRoutine, type SceneRunner } from './wake-routine';
import { WatchCalendar } from './watch-calendar';
import { isWatchDevice, type WatchChannel } from './watch-projection';
import { WatchSync } from './watch-sync';

export interface PlannerChannels {
  readonly phone: PhoneRingChannel;
  readonly watch: WatchChannel;
  readonly profileOfWatch: (deviceId: string) => string | null;
}

export interface PlannerRuntimeOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly signals: Pick<RunningHub['signals'], 'emit' | 'subscribe'>;
  readonly submit: RunningHub['submit'];
  readonly google: Pick<GoogleSyncRunner, 'reminderPull' | 'sync'>;
  readonly log: Logger;
}

const WATCH_NOT_READY: WatchOutcome = {
  ok: false,
  reason: 'unreachable',
  detail: 'The hub is still starting.',
};

function sceneRunner(options: PlannerRuntimeOptions): SceneRunner {
  return (sceneId) => {
    const actions = SCENE_ACTIONS.parse(options.store.scenes.byId(sceneId).actions);
    options.submit(
      actions.map((action) => ({
        deviceId: action.deviceId,
        capability: action.capability,
        value: action.value,
        source: 'scene',
        requestedBy: null,
      })),
    );
    return Promise.resolve();
  };
}

class ChannelSlot {
  private attached: PlannerChannels | null = null;

  readonly phone: PhoneRingChannel = {
    send: (clientId, set) => this.attached?.phone.send(clientId, set) ?? Promise.resolve(false),
  };

  readonly watch: WatchChannel = {
    send: (deviceId, action) =>
      this.attached === null
        ? Promise.resolve(WATCH_NOT_READY)
        : this.attached.watch.send(deviceId, action),
  };

  attach(channels: PlannerChannels | null): void {
    this.attached = channels;
  }

  profileOfWatch(deviceId: string): string | null {
    return this.attached?.profileOfWatch(deviceId) ?? null;
  }
}

export class PlannerRuntime {
  readonly alarms: AlarmScheduler;
  readonly timers: TimerService;
  readonly stopwatch: StopwatchService;
  readonly phoneRings: PhoneRings;
  private readonly summary: SummaryDesk;
  private readonly reminders: ReminderScheduler;
  private readonly completion: CompletionWatcher;
  private readonly watchSync: WatchSync;
  private readonly watchCalendar: WatchCalendar;
  private readonly slot = new ChannelSlot();
  private readonly stops: (() => void)[] = [];

  constructor(private readonly options: PlannerRuntimeOptions) {
    const { store, clock, signals, log } = options;
    const preferences = (profileId: string): ReturnType<typeof plannerPreferencesOf> =>
      plannerPreferencesOf(store, profileId);
    const rings = new RingDesk({ store, clock, emit: signals.emit, log });
    const wake = new WakeRoutine({ clock, runScene: sceneRunner(options), log });
    this.alarms = new AlarmScheduler({ store, clock, rings, wake, log });
    this.timers = new TimerService({
      store,
      clock,
      ports: {
        ring: (notice): void => {
          store.feed.notice(notice);
        },
        signal: signals.emit,
      },
      log,
    });
    this.stopwatch = new StopwatchService({ store, clock });
    this.summary = new SummaryDesk({ store, clock, preferencesOf: preferences, log });
    this.reminders = new ReminderScheduler({
      store,
      clock,
      emit: signals.emit,
      summary: this.summary,
      log,
      pull: options.google.reminderPull,
    });
    this.completion = new CompletionWatcher({ store, clock, emit: signals.emit, log });
    this.phoneRings = new PhoneRings({ store, channel: this.slot.phone, now: clock.now, log });
    const watch = {
      store,
      channel: this.slot.watch,
      profileOf: (deviceId: string): string | null => this.slot.profileOfWatch(deviceId),
      preferences,
      log,
    };
    this.watchSync = new WatchSync(watch);
    this.watchCalendar = new WatchCalendar({
      ...watch,
      refresh: async (profileId: string): Promise<void> => {
        await options.google.sync(profileId, 'reconcile');
      },
      now: clock.now,
    });
  }

  start(channels: PlannerChannels): void {
    this.slot.attach(channels);
    this.summary.start();
    this.alarms.start();
    this.timers.start();
    this.reminders.start();
    this.phoneRings.start();
    this.watchSync.start();
    this.watchCalendar.start();
    this.stops.push(
      this.completion.attach(this.options.signals),
      this.options.store.feed.subscribe((change): void => {
        if (change.table === 'devices' && change.record?.online === true) {
          this.connected(change.record, change.oldRecord);
        }
      }),
    );
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.watchCalendar.stop();
    this.watchSync.stop();
    this.phoneRings.stop();
    this.reminders.stop();
    this.timers.stop();
    this.alarms.stop();
    this.summary.stop();
    this.slot.attach(null);
  }

  resumed(): void {
    this.alarms.resumed();
    this.reminders.resumed();
  }

  preferencesChanged(profileId: string): void {
    this.summary.refresh(profileId);
    this.watchSync.preferencesChanged(profileId);
    this.watchCalendar.preferencesChanged(profileId);
  }

  private connected(device: DeviceRow, before: DeviceRow | null): void {
    if (before?.online === true) return;
    if (isWatchDevice(device)) {
      this.watchSync.connected(device.id);
      this.watchCalendar.connected(device.id);
      return;
    }
    const clientId = device.kind === 'phone' ? clientIdOfPhone(device.external_id) : null;
    if (clientId !== null) this.phoneRings.connected(clientId);
  }
}
