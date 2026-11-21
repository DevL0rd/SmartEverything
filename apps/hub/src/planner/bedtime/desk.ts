import {
  PLANNER_BEDTIME_NOTICE,
  PLANNER_SIGNAL,
  PLANNER_WIND_DOWN_NOTICE,
  type PlannerBedtime,
  type PlannerBedtimeNotice,
  type PlannerPreferences,
  type PlannerSleepSoundNotice,
  type PlannerWindDownNotice,
  type SignalInput,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../../clock';
import type { OwnerAlert } from '../../extensions/owner-alerts';
import { Coalesced } from '../../store/reader';
import type { Store } from '../../store/store';
import { PendingWork } from '../pending-work';
import type { AutomationRunner } from '../wake-routine';
import type { SleepSoundControl } from '../sleep-sound';
import { phonesOf } from './phones';
import { momentsOf, upcomingWindows, type BedtimeMoment } from './schedule';

const MINUTE_MS = 60_000;

const WINDOWS_AHEAD = 2;

export type BedtimeDelivery =
  PlannerBedtimeNotice | PlannerWindDownNotice | PlannerSleepSoundNotice;

export interface BedtimeChannel {
  readonly deliver: (clientId: string, notice: BedtimeDelivery) => Promise<boolean>;
  readonly push: (alert: OwnerAlert) => void;
}

export type BedtimeStore = Pick<Store, 'host' | 'settings'>;

export interface BedtimeDeskOptions {
  readonly store: BedtimeStore;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly emit: (signal: SignalInput) => void;
  readonly channel: BedtimeChannel;
  readonly runAutomation: AutomationRunner;
  readonly sleepSound: Pick<SleepSoundControl, 'play' | 'stop'>;
  readonly preferencesOf: (profileId: string) => Promise<PlannerPreferences>;
  readonly log: Logger;
}

function keyOf(moment: BedtimeMoment): string {
  return `${moment.kind}|${moment.window.bedAt}|${moment.at.toISOString()}`;
}

export class BedtimeDesk {
  private readonly armed = new Map<string, Map<string, Cancel>>();
  private readonly refreshing = new Map<string, Coalesced>();
  private running = false;
  private readonly work = new PendingWork('planner.bedtime_moment_failed');
  private firing: Promise<void> = Promise.resolve();
  private readonly sounds = new PendingWork('planner.bedtime_sleep_sound_failed');

  constructor(private readonly options: BedtimeDeskOptions) {}

  async start(): Promise<void> {
    this.running = true;
    await this.refreshAll();
  }

  stop(): void {
    this.running = false;
    for (const run of this.refreshing.values()) {
      background(run.stop(), 'planner.bedtime_stop_failed');
    }
    this.refreshing.clear();
    for (const profileId of [...this.armed.keys()]) this.disarm(profileId);
  }

  async settled(): Promise<void> {
    await this.work.settled();
    await this.sounds.settled();
    await Promise.all([...this.refreshing.values()].map((run) => run.idle()));
  }

  async refreshAll(): Promise<void> {
    const profiles = (await this.options.store.host.call('profiles', 'list')).map(
      (profile) => profile.id,
    );
    for (const profileId of this.armed.keys()) {
      if (!profiles.includes(profileId)) this.disarm(profileId);
    }
    await Promise.all(profiles.map((profileId) => this.refresh(profileId)));
  }

  async refresh(profileId: string): Promise<void> {
    if (!this.running) return;
    const run =
      this.refreshing.get(profileId) ??
      new Coalesced(
        () => this.arm(profileId),
        (cause) => {
          this.options.log.error('planner.bedtime_refresh_failed', cause, { profileId });
        },
      );
    this.refreshing.set(profileId, run);
    run.trigger();
    await run.idle();
  }

  private async arm(profileId: string): Promise<void> {
    const { clock, store } = this.options;
    const { bedtime } = await this.options.preferencesOf(profileId);
    if (!this.running) return;
    const now = clock.now();
    const moments = momentsOf(
      bedtime,
      upcomingWindows(bedtime, now, store.settings.read().time_zone, WINDOWS_AHEAD),
      now,
    );
    const wanted = new Map(moments.map((moment) => [keyOf(moment), moment]));
    const current = this.armed.get(profileId) ?? new Map<string, Cancel>();
    for (const [key, cancel] of [...current]) {
      if (!wanted.has(key)) {
        cancel();
        current.delete(key);
      }
    }
    for (const [key, moment] of wanted) {
      if (!current.has(key)) {
        current.set(
          key,
          clock.at(moment.at, () => {
            this.armed.get(profileId)?.delete(key);
            this.firing = this.firing
              .then(() => this.fired(profileId, moment))
              .catch((cause: unknown) => {
                this.options.log.error('planner.bedtime_moment_failed', cause, { profileId });
              });
            this.work.run(this.firing, { profileId });
          }),
        );
      }
    }
    this.armed.set(profileId, current);
  }

  private async fired(profileId: string, moment: BedtimeMoment): Promise<void> {
    await this.fire(profileId, moment);
    await this.refresh(profileId);
  }

  private disarm(profileId: string): void {
    for (const cancel of this.armed.get(profileId)?.values() ?? []) cancel();
    this.armed.delete(profileId);
  }

  private async fire(profileId: string, moment: BedtimeMoment): Promise<void> {
    const { bedtime } = await this.options.preferencesOf(profileId);
    this.options.log.info('planner.bedtime_moment', {
      profileId,
      kind: moment.kind,
      bedAt: moment.window.bedAt,
    });
    if (moment.kind === 'reminder') await this.remind(profileId, bedtime, moment);
    else if (moment.kind === 'wind_down') await this.windDown(profileId, bedtime, moment);
    else if (moment.kind === 'bed') this.bed(profileId, bedtime);
    else this.wake(profileId, bedtime, moment);
  }

  private async remind(
    profileId: string,
    bedtime: PlannerBedtime,
    moment: BedtimeMoment,
  ): Promise<void> {
    const { bedAt } = moment.window;
    const minutesBefore = bedtime.reminder_minutes;
    if (minutesBefore === null) return;
    const notice = PLANNER_BEDTIME_NOTICE.parse({ type: 'planner_bedtime', bedAt, minutesBefore });
    await this.tellPhones(profileId, notice);
    const local = await this.options.store.host.read('plannerClockText', { profileId, at: bedAt });
    this.options.channel.push({
      title: 'Bedtime is coming up',
      body: `Time to get ready for bed at ${local}.`,
      data: { kind: 'planner_bedtime', bedAt },
      person: profileId,
    });
    this.signal(profileId, 'bedtime_reminder', bedAt, { bedAt, minutesBefore });
  }

  private async windDown(
    profileId: string,
    bedtime: PlannerBedtime,
    moment: BedtimeMoment,
  ): Promise<void> {
    const { bedAt, wakeAt, windDownAt } = moment.window;
    const minutes = Math.round((Date.parse(bedAt) - Date.parse(windDownAt)) / MINUTE_MS);
    const automationId = bedtime.wind_down_automation_id;
    if (automationId !== null) {
      background(
        this.options.runAutomation(automationId, profileId),
        'planner.wind_down_automation_failed',
        {
          profileId,
          automationId,
        },
      );
    }
    await this.tellPhones(
      profileId,
      PLANNER_WIND_DOWN_NOTICE.parse({ type: 'planner_wind_down', bedAt, wakeAt, minutes }),
    );
    this.signal(profileId, 'wind_down_started', windDownAt, { bedAt, wakeAt, minutes });
  }

  private bed(profileId: string, bedtime: PlannerBedtime): void {
    if (bedtime.sleep_sound === null) return;
    this.sounds.run(this.options.sleepSound.play(profileId, { sound: bedtime.sleep_sound }), {
      profileId,
    });
  }

  private wake(profileId: string, bedtime: PlannerBedtime, moment: BedtimeMoment): void {
    if (bedtime.sleep_sound !== null) {
      this.sounds.run(this.options.sleepSound.stop(profileId), { profileId });
    }
    this.signal(profileId, 'wake_time', moment.window.wakeAt, { wakeAt: moment.window.wakeAt });
  }

  private async tellPhones(
    profileId: string,
    notice: PlannerBedtimeNotice | PlannerWindDownNotice,
  ): Promise<void> {
    for (const phone of await phonesOf(this.options.store, profileId)) {
      background(this.options.channel.deliver(phone.id, notice), 'planner.bedtime_notice_failed', {
        profileId,
        clientId: phone.id,
      });
    }
  }

  private signal(
    profileId: string,
    kind: 'bedtime_reminder' | 'wind_down_started' | 'wake_time',
    value: string,
    data: object,
  ): void {
    this.options.emit(
      PLANNER_SIGNAL.parse({
        source: 'planner',
        kind,
        subject: profileId,
        field: null,
        value,
        previous: null,
        at: this.options.clock.now().toISOString(),
        profileId,
        data,
      }),
    );
  }
}
