import type { DeviceRow, PlannerPreferences } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { GoogleSyncRunner } from '../google/sync-runner';
import type { RunningHub } from '../hub';
import type { WatchOutcome } from '../local/watch-actions';
import { clientIdOfPhone } from '../phones/phone-device';
import type { Store } from '../store/store';
import { AlarmSoundCheck } from './alarm-sound-check';
import { AlarmScheduler } from './alarms';
import { BedtimeDesk, type BedtimeChannel } from './bedtime/desk';
import { CompletionWatcher } from './completion';
import { FeedService } from './feeds';
import type { CalendarReader } from './ical/calendar-reader';
import { PhoneRings, type PhoneRingChannel } from './phone-rings';
import { loadPlannerPreferences } from './preferences';
import { ReminderScheduler } from './reminders';
import { RingDesk } from './rings';
import { CollaborationDesk } from './sharing/desk';
import { SleepSoundControl } from './sleep-sound';
import { StopwatchService } from './stopwatch';
import { SunriseRamp } from './sunrise';
import { SummaryDesk } from './summary';
import { TimerService } from './timers';
import { WakeRoutine, type AutomationRunner } from './wake-routine';
import { WatchCalendar } from './watch-calendar';
import { isWatchDevice, type WatchChannel } from './watch-projection';
import { WatchSync } from './watch-sync';

export interface PlannerChannels {
  readonly phone: PhoneRingChannel;
  readonly bedtime: BedtimeChannel;
  readonly watch: WatchChannel;
  readonly profileOfWatch: (deviceId: string) => Promise<string | null>;
}

export interface PlannerRuntimeOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly signals: Pick<RunningHub['signals'], 'emit' | 'subscribe'>;
  readonly submit: RunningHub['submit'];
  readonly automations: Pick<RunningHub['automationEngine'], 'start'>;
  readonly google: Pick<GoogleSyncRunner, 'reminderPull' | 'sync'>;
  readonly calendars: CalendarReader;
  readonly log: Logger;
}

const WATCH_NOT_READY: WatchOutcome = {
  ok: false,
  reason: 'unreachable',
  detail: 'The hub is still starting.',
};

function automationRunner(options: PlannerRuntimeOptions): AutomationRunner {
  return (automationId, profileId) => {
    const submission = options.automations.start(automationId, {}, profileId);
    return submission.kind === 'refused' ? Promise.reject(submission.error) : Promise.resolve();
  };
}

function bedtimeOf(
  options: PlannerRuntimeOptions,
  channel: BedtimeChannel,
): { readonly desk: BedtimeDesk; readonly sleepSound: SleepSoundControl } {
  const { store, clock, signals, log } = options;
  const preferencesOf = (profileId: string): Promise<PlannerPreferences> =>
    loadPlannerPreferences(store, profileId);
  const sleepSound = new SleepSoundControl({
    store,
    deliver: channel.deliver,
    preferencesOf,
    log,
  });
  const desk = new BedtimeDesk({
    store,
    clock,
    emit: signals.emit,
    channel,
    runAutomation: automationRunner(options),
    sleepSound,
    preferencesOf,
    log,
  });
  return { desk, sleepSound };
}

class ChannelSlot {
  private attached: PlannerChannels | null = null;

  readonly phone: PhoneRingChannel = {
    send: (clientId, set) => this.attached?.phone.send(clientId, set) ?? Promise.resolve(false),
  };

  readonly bedtime: BedtimeChannel = {
    deliver: (clientId, notice) =>
      this.attached?.bedtime.deliver(clientId, notice) ?? Promise.resolve(false),
    push: (alert) => {
      this.attached?.bedtime.push(alert);
    },
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

  async profileOfWatch(deviceId: string): Promise<string | null> {
    return this.attached === null ? null : await this.attached.profileOfWatch(deviceId);
  }
}

function timersOf(options: PlannerRuntimeOptions): TimerService {
  const { store, clock, signals, log } = options;
  return new TimerService({
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
}

function watchOf(
  options: PlannerRuntimeOptions,
  slot: ChannelSlot,
  preferences: (profileId: string) => Promise<PlannerPreferences>,
): { readonly sync: WatchSync; readonly calendar: WatchCalendar } {
  const { store, clock, log } = options;
  const watch = {
    store,
    channel: slot.watch,
    profileOf: (deviceId: string): Promise<string | null> => slot.profileOfWatch(deviceId),
    preferences,
    log,
  };
  const calendar = new WatchCalendar({
    ...watch,
    refresh: async (profileId: string): Promise<void> => {
      await options.google.sync(profileId, 'reconcile');
    },
    now: clock.now,
  });
  return { sync: new WatchSync(watch), calendar };
}

export class PlannerRuntime {
  readonly alarms: AlarmScheduler;
  readonly timers: TimerService;
  readonly stopwatch: StopwatchService;
  readonly phoneRings: PhoneRings;
  readonly sounds: AlarmSoundCheck;
  readonly sleepSound: SleepSoundControl;
  readonly feeds: FeedService;
  readonly calendars: CalendarReader;
  private readonly bedtime: BedtimeDesk;
  private readonly summary: SummaryDesk;
  private readonly reminders: ReminderScheduler;
  private readonly completion: CompletionWatcher;
  private readonly collaboration: CollaborationDesk;
  private readonly watchSync: WatchSync;
  private readonly watchCalendar: WatchCalendar;
  private readonly slot = new ChannelSlot();
  private readonly stops: (() => void)[] = [];
  private starting: Promise<void> = Promise.resolve();

  constructor(private readonly options: PlannerRuntimeOptions) {
    const { store, clock, signals, log } = options;
    const preferences = (profileId: string): Promise<PlannerPreferences> =>
      loadPlannerPreferences(store, profileId);
    const rings = new RingDesk({ store, clock, emit: signals.emit, log });
    const wake = new WakeRoutine({ clock, runAutomation: automationRunner(options), log });
    const sunrise = new SunriseRamp({ store, clock, submit: options.submit, log });
    this.alarms = new AlarmScheduler({ store, clock, rings, wake, sunrise, log });
    this.timers = timersOf(options);
    this.stopwatch = new StopwatchService({ store, clock });
    this.summary = new SummaryDesk({ store, clock, log });
    this.reminders = new ReminderScheduler({
      store,
      clock,
      emit: signals.emit,
      summary: this.summary,
      log,
      pull: options.google.reminderPull,
    });
    this.completion = new CompletionWatcher({ store, clock, emit: signals.emit, log });
    this.collaboration = new CollaborationDesk({ store, clock, emit: signals.emit });
    this.sounds = new AlarmSoundCheck(store);
    this.calendars = options.calendars;
    this.feeds = new FeedService({ store, clock, calendars: options.calendars, log });
    this.phoneRings = new PhoneRings({
      store,
      channel: this.slot.phone,
      now: clock.now,
      log,
    });
    const bedtime = bedtimeOf(options, this.slot.bedtime);
    this.sleepSound = bedtime.sleepSound;
    this.bedtime = bedtime.desk;
    const watch = watchOf(options, this.slot, preferences);
    this.watchSync = watch.sync;
    this.watchCalendar = watch.calendar;
  }

  start(channels: PlannerChannels): void {
    this.slot.attach(channels);
    this.collaboration.start();
    this.phoneRings.start();
    this.feeds.start();
    this.watchSync.start();
    this.starting = Promise.all([
      this.summary.start(),
      this.alarms.start(),
      this.timers.start(),
      this.reminders.start(),
      this.bedtime.start(),
    ]).then(() => undefined);
    background(this.starting, 'planner.start_failed');
    this.watchCalendar.start();
    this.stops.push(
      this.completion.attach(this.options.signals),
      this.options.store.feed.subscribe((change): void => {
        if (change.table === 'devices' && change.record?.online === true) {
          this.connected(change.record, change.oldRecord);
        } else if (change.table === 'settings') {
          background(this.bedtime.refreshAll(), 'planner.bedtime_refresh_failed');
        }
      }),
    );
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.watchCalendar.stop();
    this.watchSync.stop();
    this.bedtime.stop();
    this.feeds.stop();
    this.phoneRings.stop();
    this.collaboration.stop();
    this.reminders.stop();
    this.timers.stop();
    this.alarms.stop();
    this.summary.stop();
    this.slot.attach(null);
  }

  async ready(): Promise<void> {
    await this.starting;
  }

  async settled(): Promise<void> {
    await this.starting;
    await Promise.all([
      this.summary.settled(),
      this.reminders.settled(),
      this.alarms.settled(),
      this.timers.settled(),
      this.phoneRings.settled(),
      this.bedtime.settled(),
      this.watchSync.settled(),
      this.watchCalendar.settled(),
      this.completion.settled(),
      this.collaboration.settled(),
      this.feeds.settled(),
    ]);
  }

  resumed(): void {
    background(
      Promise.all([this.alarms.resumed(), this.reminders.resumed(), this.bedtime.refreshAll()]),
      'planner.resume_failed',
    );
  }

  preferencesChanged(profileId: string): void {
    background(this.summary.refresh(profileId), 'planner.summary_failed', { profileId });
    this.phoneRings.preferencesChanged(profileId);
    background(this.bedtime.refresh(profileId), 'planner.bedtime_refresh_failed', { profileId });
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
