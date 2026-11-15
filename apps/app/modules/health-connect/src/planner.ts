import { NativeModule, requireOptionalNativeModule } from 'expo';
import { PLANNER_PHONE_RING_SET, type PlannerPhoneRingSet } from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateNeededError, type SyncProgressSubscription } from './health-connect';

const RINGING = z.array(z.string().min(1));
const NEXT_ALARM = z.iso.datetime({ offset: true }).nullable();
const CLIENT_ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const RING_STATUS = z.strictObject({
  ringKey: z.string().min(1),
  ringing: z.boolean(),
  snoozesLeft: z.int().nonnegative().nullable(),
  nowPlaying: z.string().min(1).nullable(),
  safetyNet: z.string().min(1).nullable(),
});

export type RingStatus = z.infer<typeof RING_STATUS>;

const RING_FIELDS = {
  ringKey: z.string().min(1),
  snoozesLeft: z.int().nonnegative().nullable(),
  nowPlaying: z.string().min(1).nullable(),
  safetyNet: z.string().min(1).nullable(),
};

const EVENT_BASE = { detail: z.string(), at: MOMENT };

export const PLANNER_NATIVE_EVENT = z.discriminatedUnion('event', [
  z.strictObject({ ...EVENT_BASE, event: z.literal('ring_started'), ...RING_FIELDS }),
  z.strictObject({ ...EVENT_BASE, event: z.literal('ring_playback'), ...RING_FIELDS }),
  z.strictObject({ ...EVENT_BASE, event: z.literal('ring_ended'), ringKey: z.string().min(1) }),
  z.strictObject({ ...EVENT_BASE, event: z.literal('steps'), count: z.int().nonnegative() }),
  z.strictObject({
    ...EVENT_BASE,
    event: z.literal('sleep_sound'),
    state: z.enum(['playing', 'stopped', 'failed']),
    title: z.string().min(1).optional(),
    endsAt: MOMENT.nullable().optional(),
    reason: z.string().min(1).optional(),
  }),
]);

export type PlannerNativeEvent = z.infer<typeof PLANNER_NATIVE_EVENT>;

export const SLEEP_SOUND_STATE = z.strictObject({
  playing: z.boolean(),
  title: z.string().min(1).nullable(),
  endsAt: MOMENT.nullable(),
});

export type SleepSoundState = z.infer<typeof SLEEP_SOUND_STATE>;

const SLEEP_FILE = z.strictObject({
  item_id: z.uuid(),
  name: z.string().min(1),
  etag: z.string().min(1),
});

export const SLEEP_SOUND_REQUEST = z.strictObject({
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('noise'), colour: z.enum(['white', 'pink', 'brown']) }),
    z.strictObject({
      kind: z.literal('files'),
      files: z.array(SLEEP_FILE).min(1).readonly(),
      shuffle: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('radio'),
      name: z.string().min(1),
      url: z.url({ protocol: /^https?$/ }),
    }),
  ]),
  timerMinutes: z.int().positive().nullable(),
  fadeSeconds: z.int().nonnegative(),
});

export type SleepSoundRequest = z.infer<typeof SLEEP_SOUND_REQUEST>;

interface PlannerEvents {
  readonly onPlannerEvent: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class PlannerNative extends NativeModule<PlannerEvents> {
  installPhoneRings(setJson: string, clientId: string): Promise<void>;
  snoozeRing(ringKey: string, minutes: number | null): Promise<void>;
  dismissRing(ringKey: string): Promise<void>;
  stopRing(ringKey: string): Promise<void>;
  ringingRings(): Promise<unknown>;
  ringStatus(ringKey: string): Promise<unknown>;
  stepCounterAvailable(): Promise<boolean>;
  stepCounterPermitted(): Promise<boolean>;
  requestStepCounterPermission(): Promise<boolean>;
  startStepCount(): Promise<void>;
  stopStepCount(): Promise<void>;
  startSleepSound(requestJson: string): Promise<void>;
  stopSleepSound(): Promise<void>;
  sleepSoundState(): Promise<unknown>;
  notificationPolicyAllowed(): Promise<boolean>;
  openNotificationPolicySettings(): Promise<void>;
  fullScreenAlarmAllowed(): Promise<boolean>;
  openFullScreenAlarmSettings(): Promise<void>;
  batteryOptimizationIgnored(): Promise<boolean>;
  openBatterySettings(): Promise<void>;
  nextSystemAlarm(): Promise<unknown>;
}

type PlannerName = Exclude<keyof PlannerNative, keyof NativeModule<PlannerEvents>>;

const planner = requireOptionalNativeModule<PlannerNative>('Planner');

function plannerFor(operation: PlannerName): PlannerNative {
  if (planner === null || typeof Reflect.get(planner, operation) !== 'function') {
    throw new AppUpdateNeededError(`phone alarms (${operation})`);
  }
  return planner;
}

export function plannerLinked(): boolean {
  return planner !== null;
}

export async function installPhoneRings(set: PlannerPhoneRingSet, clientId: string): Promise<void> {
  await plannerFor('installPhoneRings').installPhoneRings(
    JSON.stringify(PLANNER_PHONE_RING_SET.parse(set)),
    CLIENT_ID.parse(clientId),
  );
}

export async function snoozeRing(ringKey: string, minutes: number | null = null): Promise<void> {
  await plannerFor('snoozeRing').snoozeRing(ringKey, minutes);
}

export async function dismissRing(ringKey: string): Promise<void> {
  await plannerFor('dismissRing').dismissRing(ringKey);
}

export async function stopRing(ringKey: string): Promise<void> {
  await plannerFor('stopRing').stopRing(ringKey);
}

export async function ringingRings(): Promise<readonly string[]> {
  return RINGING.parse(await plannerFor('ringingRings').ringingRings());
}

export async function fullScreenAlarmAllowed(): Promise<boolean> {
  return plannerFor('fullScreenAlarmAllowed').fullScreenAlarmAllowed();
}

export async function openFullScreenAlarmSettings(): Promise<void> {
  await plannerFor('openFullScreenAlarmSettings').openFullScreenAlarmSettings();
}

export async function batteryOptimizationIgnored(): Promise<boolean> {
  return plannerFor('batteryOptimizationIgnored').batteryOptimizationIgnored();
}

export async function openBatterySettings(): Promise<void> {
  await plannerFor('openBatterySettings').openBatterySettings();
}

export async function nextSystemAlarm(): Promise<string | null> {
  return NEXT_ALARM.parse(await plannerFor('nextSystemAlarm').nextSystemAlarm());
}

export async function ringStatus(ringKey: string): Promise<RingStatus> {
  return RING_STATUS.parse(await plannerFor('ringStatus').ringStatus(ringKey));
}

export function addPlannerEventListener(
  listener: (event: PlannerNativeEvent) => void,
): SyncProgressSubscription {
  return plannerFor('ringStatus').addListener('onPlannerEvent', (payload) => {
    listener(PLANNER_NATIVE_EVENT.parse(payload));
  });
}

export async function stepCounterAvailable(): Promise<boolean> {
  return plannerFor('stepCounterAvailable').stepCounterAvailable();
}

export async function stepCounterPermitted(): Promise<boolean> {
  return plannerFor('stepCounterPermitted').stepCounterPermitted();
}

export async function requestStepCounterPermission(): Promise<boolean> {
  return plannerFor('requestStepCounterPermission').requestStepCounterPermission();
}

export async function startStepCount(): Promise<void> {
  await plannerFor('startStepCount').startStepCount();
}

export async function stopStepCount(): Promise<void> {
  await plannerFor('stopStepCount').stopStepCount();
}

export async function startSleepSound(request: SleepSoundRequest): Promise<void> {
  await plannerFor('startSleepSound').startSleepSound(
    JSON.stringify(SLEEP_SOUND_REQUEST.parse(request)),
  );
}

export async function stopSleepSound(): Promise<void> {
  await plannerFor('stopSleepSound').stopSleepSound();
}

export async function sleepSoundState(): Promise<SleepSoundState> {
  return SLEEP_SOUND_STATE.parse(await plannerFor('sleepSoundState').sleepSoundState());
}

export async function notificationPolicyAllowed(): Promise<boolean> {
  return plannerFor('notificationPolicyAllowed').notificationPolicyAllowed();
}

export async function openNotificationPolicySettings(): Promise<void> {
  await plannerFor('openNotificationPolicySettings').openNotificationPolicySettings();
}
