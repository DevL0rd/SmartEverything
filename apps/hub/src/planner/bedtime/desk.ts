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
import type { Store } from '../../store/store';
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

export type BedtimeStore = Pick<Store, 'clients' | 'profiles' | 'settings'>;

export interface BedtimeDeskOptions {
  readonly store: BedtimeStore;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly emit: (signal: SignalInput) => void;
  readonly channel: BedtimeChannel;
  readonly runAutomation: AutomationRunner;
  readonly sleepSound: Pick<SleepSoundControl, 'play' | 'stop'>;
  readonly preferencesOf: (profileId: string) => PlannerPreferences;
  readonly log: Logger;
}

function keyOf(moment: BedtimeMoment): string {
  return `${moment.kind}|${moment.window.bedAt}|${moment.at.toISOString()}`;
}

export class BedtimeDesk {
  private readonly armed = new Map<string, Map<string, Cancel>>();

  constructor(private readonly options: BedtimeDeskOptions) {}

  start(): void {
    this.refreshAll();
  }

  stop(): void {
    for (const profileId of [...this.armed.keys()]) this.disarm(profileId);
  }

  refreshAll(): void {
    const profiles = this.options.store.profiles.list().map((profile) => profile.id);
    for (const profileId of this.armed.keys()) {
      if (!profiles.includes(profileId)) this.disarm(profileId);
    }
    for (const profileId of profiles) this.refresh(profileId);
  }

  refresh(profileId: string): void {
    const { clock, store } = this.options;
    const bedtime = this.options.preferencesOf(profileId).bedtime;
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
            this.fire(profileId, moment);
            this.refresh(profileId);
          }),
        );
      }
    }
    this.armed.set(profileId, current);
  }

  private disarm(profileId: string): void {
    for (const cancel of this.armed.get(profileId)?.values() ?? []) cancel();
    this.armed.delete(profileId);
  }

  private fire(profileId: string, moment: BedtimeMoment): void {
    const bedtime = this.options.preferencesOf(profileId).bedtime;
    this.options.log.info('planner.bedtime_moment', {
      profileId,
      kind: moment.kind,
      bedAt: moment.window.bedAt,
    });
    if (moment.kind === 'reminder') this.remind(profileId, bedtime, moment);
    else if (moment.kind === 'wind_down') this.windDown(profileId, bedtime, moment);
    else if (moment.kind === 'bed') this.bed(profileId, bedtime);
    else this.wake(profileId, bedtime, moment);
  }

  private remind(profileId: string, bedtime: PlannerBedtime, moment: BedtimeMoment): void {
    const { bedAt } = moment.window;
    const minutesBefore = bedtime.reminder_minutes;
    if (minutesBefore === null) return;
    const notice = PLANNER_BEDTIME_NOTICE.parse({ type: 'planner_bedtime', bedAt, minutesBefore });
    this.tellPhones(profileId, notice);
    this.options.channel.push({
      title: 'Bedtime is coming up',
      body: `Time to get ready for bed at ${this.localTime(bedAt)}.`,
      data: { kind: 'planner_bedtime', bedAt },
      person: profileId,
    });
    this.signal(profileId, 'bedtime_reminder', bedAt, { bedAt, minutesBefore });
  }

  private windDown(profileId: string, bedtime: PlannerBedtime, moment: BedtimeMoment): void {
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
    this.tellPhones(
      profileId,
      PLANNER_WIND_DOWN_NOTICE.parse({ type: 'planner_wind_down', bedAt, wakeAt, minutes }),
    );
    this.signal(profileId, 'wind_down_started', windDownAt, { bedAt, wakeAt, minutes });
  }

  private bed(profileId: string, bedtime: PlannerBedtime): void {
    if (bedtime.sleep_sound === null) return;
    background(
      this.options.sleepSound.play(profileId, { sound: bedtime.sleep_sound }),
      'planner.bedtime_sleep_sound_failed',
      { profileId },
    );
  }

  private wake(profileId: string, bedtime: PlannerBedtime, moment: BedtimeMoment): void {
    if (bedtime.sleep_sound !== null) {
      background(this.options.sleepSound.stop(profileId), 'planner.bedtime_sleep_sound_failed', {
        profileId,
      });
    }
    this.signal(profileId, 'wake_time', moment.window.wakeAt, { wakeAt: moment.window.wakeAt });
  }

  private tellPhones(
    profileId: string,
    notice: PlannerBedtimeNotice | PlannerWindDownNotice,
  ): void {
    for (const phone of phonesOf(this.options.store, profileId)) {
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

  private localTime(iso: string): string {
    return Temporal.Instant.from(iso)
      .toZonedDateTimeISO(this.options.store.settings.read().time_zone)
      .toPlainTime()
      .toString({ smallestUnit: 'minute' });
  }
}
