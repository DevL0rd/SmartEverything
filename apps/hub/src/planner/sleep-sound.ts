import {
  ApiError,
  PLANNER_SLEEP_SOUND_NOTICE,
  type PlannerPreferences,
  type PlannerSleepSound,
  type PlannerSleepSoundNotice,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { AlarmSounds } from './alarm-sound';
import { phonesOf, type PhoneDirectory } from './bedtime/phones';

export type SleepSoundDelivery = (
  clientId: string,
  notice: PlannerSleepSoundNotice,
) => Promise<boolean>;

export interface SleepSoundOptions {
  readonly store: PhoneDirectory;
  readonly sounds: Pick<AlarmSounds, 'sleepSource'>;
  readonly deliver: SleepSoundDelivery;
  readonly preferencesOf: (profileId: string) => PlannerPreferences;
  readonly log: Logger;
}

export interface SleepSoundRequest {
  readonly sound?: PlannerSleepSound | undefined;
  readonly timerMinutes?: number | null | undefined;
  readonly fadeSeconds?: number | undefined;
  readonly clientId?: string | undefined;
}

export class SleepSoundControl {
  constructor(private readonly options: SleepSoundOptions) {}

  async play(profileId: string, request: SleepSoundRequest = {}): Promise<number> {
    const preferences = this.options.preferencesOf(profileId);
    const sound =
      request.sound ?? preferences.sleep_sounds.sound ?? preferences.bedtime.sleep_sound;
    if (sound === null) {
      throw new ApiError('invalid_request', 'Choose a sleep sound first.');
    }
    return this.send(
      profileId,
      PLANNER_SLEEP_SOUND_NOTICE.parse({
        type: 'planner_sleep_sound',
        action: 'play',
        sound: this.options.sounds.sleepSource(profileId, sound),
        timerMinutes:
          request.timerMinutes === undefined
            ? preferences.sleep_sounds.timer_minutes
            : request.timerMinutes,
        fadeSeconds: request.fadeSeconds ?? preferences.sleep_sounds.fade_seconds,
      }),
      request.clientId,
    );
  }

  stop(profileId: string, clientId?: string): Promise<number> {
    return this.send(
      profileId,
      PLANNER_SLEEP_SOUND_NOTICE.parse({
        type: 'planner_sleep_sound',
        action: 'stop',
        sound: null,
        timerMinutes: null,
        fadeSeconds: 0,
      }),
      clientId,
    );
  }

  private async send(
    profileId: string,
    notice: PlannerSleepSoundNotice,
    clientId: string | undefined,
  ): Promise<number> {
    const phones = phonesOf(this.options.store, profileId).filter(
      (phone) => clientId === undefined || phone.id === clientId,
    );
    if (clientId !== undefined && phones.length === 0) {
      throw new ApiError('not_found', 'That phone does not belong to this person.');
    }
    const reached = await Promise.all(
      phones.map((phone) => this.options.deliver(phone.id, notice)),
    );
    const count = reached.filter(Boolean).length;
    this.options.log.info('planner.sleep_sound_sent', {
      profileId,
      action: notice.action,
      phones: phones.length,
      reached: count,
    });
    return count;
  }
}
