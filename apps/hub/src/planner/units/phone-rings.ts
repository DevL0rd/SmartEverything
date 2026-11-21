import { createHash } from 'node:crypto';
import type {
  PlannerAlarmRow,
  PlannerAlarmSound,
  PlannerPhoneRingSet,
  PlannerPreferences,
  PlannerRingTarget,
  PlannerTimerRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import { clientIdOfPhone } from '../../phones/phone-device';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import { AlarmSounds, DEFAULT_TONE } from '../alarm-sound';
import { ringSetOf } from '../phone-ring-set';
import type { PHONE_RING_ALARM, PHONE_RING_TIMER, PhoneRingSet } from '../phone-rings';
import { plannerPreferencesOf } from '../preferences';

const log = new Logger('hub.planner');

type Targeted = Pick<PlannerAlarmRow | PlannerTimerRow, 'targets'>;

function alarmRule(alarm: PlannerAlarmRow): z.infer<typeof PHONE_RING_ALARM> {
  return {
    id: alarm.id,
    profileId: alarm.profile_id,
    label: alarm.label,
    time: alarm.time,
    days: alarm.days,
    onceOn: alarm.once_on,
    skipOn: alarm.skip_on,
    sound: alarm.sound,
    rampSeconds: alarm.ramp_seconds,
    vibrate: alarm.vibrate,
    snoozeMinutes: alarm.snooze_minutes,
    snoozeLimit: alarm.snooze_limit,
    challenge: alarm.challenge,
  };
}

function timerEnd(timer: PlannerTimerRow): z.infer<typeof PHONE_RING_TIMER>[] {
  return timer.ends_at === null
    ? []
    : [{ id: timer.id, profileId: timer.profile_id, label: timer.label, endsAt: timer.ends_at }];
}

function bedtimeRule(preferences: PlannerPreferences | null): PhoneRingSet['bedtime'] {
  const bedtime = preferences?.bedtime;
  return bedtime?.enabled === true && bedtime.do_not_disturb
    ? { schedule: bedtime.schedule, windDownMinutes: bedtime.wind_down_minutes }
    : null;
}

function versionOf(content: Omit<PhoneRingSet, 'version'>): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function byId<T extends { readonly id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function clientOf(store: Store, target: PlannerRingTarget): string | null {
  if (target.kind === 'client') {
    return target.clientId;
  }
  const device = store.devices.find(target.deviceId);
  return device?.kind === 'phone' ? clientIdOfPhone(device.external_id) : null;
}

function hasRings(store: Store, clientId: string): boolean {
  const platform = store.clients.find(clientId)?.platform;
  return platform === 'android' || platform === 'desktop';
}

function reaches(store: Store, row: Targeted, clientId: string): boolean {
  return row.targets.some((target) => clientOf(store, target) === clientId);
}

function mediaOf(
  sounds: AlarmSounds,
  alarms: readonly z.infer<typeof PHONE_RING_ALARM>[],
  timers: readonly z.infer<typeof PHONE_RING_TIMER>[],
  timerSound: PlannerAlarmSound,
): string[] {
  const entries = alarms.flatMap((alarm) => sounds.media(alarm.profileId, alarm.sound));
  const ending = timers.flatMap((timer) => sounds.media(timer.profileId, timerSound));
  return [...new Set([...entries, ...ending])].sort();
}

function desired(store: Store, clientId: string): PhoneRingSet {
  const profileId = store.clients.find(clientId)?.profile_id ?? null;
  const preferences = profileId === null ? null : plannerPreferencesOf(store, profileId);
  const alarms = store.plannerAlarms
    .enabled()
    .filter((alarm) => reaches(store, alarm, clientId))
    .map(alarmRule)
    .sort(byId);
  const timers = store.plannerTimers
    .running()
    .filter((timer) => reaches(store, timer, clientId))
    .flatMap(timerEnd)
    .sort(byId);
  const timerSound = preferences?.clock.sound ?? DEFAULT_TONE;
  const content = {
    zone: store.settings.read().time_zone,
    alarms,
    timers,
    timerSound,
    bedtime: bedtimeRule(preferences),
    media: mediaOf(new AlarmSounds(store, log), alarms, timers, timerSound),
  };
  return { version: versionOf(content), ...content };
}

export interface PhoneRingRead {
  readonly set: PhoneRingSet;
  readonly rings: PlannerPhoneRingSet;
}

function readRings(
  store: Store,
  {
    clientId,
    profileId,
    nowMs,
  }: { readonly clientId: string; readonly profileId: string; readonly nowMs: number },
): PhoneRingRead {
  const set = desired(store, clientId);
  const rings = ringSetOf(set, {
    sounds: new AlarmSounds(store, log),
    preferences: plannerPreferencesOf(store, profileId),
    now: new Date(nowMs),
    zone: set.zone,
  });
  return { set, rings };
}

function ringClientsOf(
  store: Store,
  { targets }: { readonly targets: readonly PlannerRingTarget[] },
): string[] {
  const clients = new Set<string>();
  for (const target of targets) {
    const clientId = clientOf(store, target);
    if (clientId !== null && hasRings(store, clientId)) clients.add(clientId);
  }
  return [...clients];
}

export const PLANNER_PHONE_READ_UNITS = {
  plannerPhoneRingSet: storeUnit((store, { clientId }: { readonly clientId: string }) =>
    desired(store, clientId),
  ),
  plannerPhoneRingRead: storeUnit(readRings),
  plannerRingClients: storeUnit(ringClientsOf),
  plannerRingClientIds: storeUnit(
    (store, { clientIds }: { readonly clientIds: readonly string[] }): string[] =>
      clientIds.filter((clientId) => hasRings(store, clientId)),
  ),
  plannerProfileRingClients: storeUnit(
    (store, { profileId }: { readonly profileId: string }): string[] =>
      store.clients
        .list()
        .filter((client) => client.profile_id === profileId && hasRings(store, client.id))
        .map((client) => client.id),
  ),
} as const;
