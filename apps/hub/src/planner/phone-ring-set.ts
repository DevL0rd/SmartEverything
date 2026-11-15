import type {
  PlannerAlarmSound,
  PlannerPhoneRingSet,
  PlannerPreferences,
} from '@smarteverything/domain';
import type { AlarmSounds } from './alarm-sound';
import { nextRing } from './alarms';
import { bedtimeWindows } from './phone-bedtime';
import type { PhoneRingSet } from './phone-rings';

export interface RingSetContext {
  readonly sounds: Pick<AlarmSounds, 'resolve'>;
  readonly preferences: PlannerPreferences;
  readonly now: Date;
  readonly zone: string;
}

type PhoneRing = PlannerPhoneRingSet['rings'][number];

function alarmRings(set: PhoneRingSet, context: RingSetContext): PhoneRing[] {
  return set.alarms.flatMap((alarm) => {
    const dueAt = nextRing(
      { time: alarm.time, days: alarm.days, once_on: alarm.onceOn, skip_on: alarm.skipOn },
      context.now,
      context.zone,
    );
    if (dueAt === null) {
      return [];
    }
    const ringKey = `alarm:${alarm.id}`;
    return [
      {
        ringKey,
        kind: 'alarm' as const,
        refId: alarm.id,
        dueAt: dueAt.toISOString(),
        sound: context.sounds.resolve(alarm.profileId, alarm.sound, ringKey, dueAt),
        rampSeconds: alarm.rampSeconds,
        vibrate: alarm.vibrate,
        snoozeLimit: alarm.snoozeLimit,
        challenge: alarm.challenge,
        label: alarm.label,
      },
    ];
  });
}

function timerRings(set: PhoneRingSet, context: RingSetContext): PhoneRing[] {
  const sound: PlannerAlarmSound = context.preferences.clock.sound;
  return set.timers.map((timer) => {
    const ringKey = `timer:${timer.id}`;
    return {
      ringKey,
      kind: 'timer' as const,
      refId: timer.id,
      dueAt: timer.endsAt,
      sound: context.sounds.resolve(timer.profileId, sound, ringKey, new Date(timer.endsAt)),
      rampSeconds: 0,
      vibrate: true,
      snoozeLimit: null,
      challenge: { kind: 'none' as const },
      label: timer.label,
    };
  });
}

export function ringSetOf(set: PhoneRingSet, context: RingSetContext): PlannerPhoneRingSet {
  return {
    hash: set.version,
    rings: [...alarmRings(set, context), ...timerRings(set, context)],
    bedtimeWindows: bedtimeWindows(context.preferences.bedtime, context.now, context.zone),
  };
}
