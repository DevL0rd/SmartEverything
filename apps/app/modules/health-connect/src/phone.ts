import { withNativeEnrollment } from './hub-network';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import { PHONE_CONTEXT_STATE, PHONE_PLACE_NAME } from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateNeededError, type SyncProgressSubscription } from './health-connect';

const MOMENT = z.iso.datetime({ offset: true });

const PHONE_SENSORS = [
  'activity',
  'places',
  'car',
  'navigation',
  'screen_time',
  'app_usage',
  'notification_titles',
] as const;

export type PhoneSensor = (typeof PHONE_SENSORS)[number];

const PHONE_PERMISSIONS = z.object({
  activity: z.boolean(),
  location: z.boolean(),
  backgroundLocation: z.boolean(),
  notificationAccess: z.boolean(),
  dndAccess: z.boolean(),
  usageAccess: z.boolean(),
  batteryUnrestricted: z.boolean(),
  writeSettings: z.boolean(),
  overlay: z.boolean(),
  accessibility: z.boolean(),
});

const PHONE_CAR = z.object({ name: z.string(), address: z.string().min(1) });

export type PhoneCar = z.infer<typeof PHONE_CAR>;

const PHONE_NODE_CONTEXT = z.object({
  state: PHONE_CONTEXT_STATE,
  since: MOMENT,
  confidence: z.int().min(0).max(100),
  place: PHONE_PLACE_NAME.nullable(),
});

const PHONE_NODE_STATUS = z.object({
  enabled: z.boolean(),
  sensors: z.record(z.enum(PHONE_SENSORS), z.boolean()),
  permissions: PHONE_PERMISSIONS,
  context: PHONE_NODE_CONTEXT,
  car: PHONE_CAR.nullable(),
  carSupported: z.boolean(),
  homeWifi: z.string().nullable(),
  currentWifi: z.string().nullable(),
});

export type PhoneNodeStatus = z.infer<typeof PHONE_NODE_STATUS>;

const PHONE_CARS = z.array(PHONE_CAR);

const PARKED_SPOT = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0),
    at: MOMENT,
    place: PHONE_PLACE_NAME.nullable(),
  })
  .nullable();

export type ParkedSpot = NonNullable<z.infer<typeof PARKED_SPOT>>;

const PHONE_NATIVE_EVENT = z.object({
  event: z.string().min(1),
  detail: z.string(),
  at: MOMENT,
});

export type PhoneNativeEvent = z.infer<typeof PHONE_NATIVE_EVENT>;

const ASSOCIATION = z.string().min(1);

interface PhoneEvents {
  readonly onPhoneEvent: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class PhoneNative extends NativeModule<PhoneEvents> {
  startPhoneNode(serverUrl: string, token: string, enrollment: string): Promise<unknown>;
  stopPhoneNode(): Promise<unknown>;
  phoneStatus(): Promise<unknown>;
  setPhoneSensor(sensor: PhoneSensor, on: boolean): Promise<unknown>;
  phoneCarCandidates(): Promise<unknown>;
  choosePhoneCar(address: string): Promise<unknown>;
  forgetPhoneCar(): Promise<unknown>;
  setHomeWifi(useCurrent: boolean): Promise<unknown>;
  parkedSpot(): Promise<unknown>;
  openUsageAccess(): Promise<unknown>;
  openAccessibilitySettings(): Promise<unknown>;
  openWriteSettings(): Promise<unknown>;
  openBatteryOptimization(): Promise<unknown>;
}

type PhoneOperation = Exclude<keyof PhoneNative, keyof NativeModule<PhoneEvents>> | 'addListener';

const native = requireOptionalNativeModule<PhoneNative>('Phone');

export const phoneNodeLinked = native !== null;

function phoneFor(operation: PhoneOperation): PhoneNative {
  if (native === null || typeof Reflect.get(native, operation) !== 'function') {
    throw new AppUpdateNeededError(`the phone node (${operation})`);
  }
  return native;
}

export async function startPhoneNode(serverUrl: string, token: string): Promise<void> {
  const source = phoneFor('startPhoneNode');
  await withNativeEnrollment(serverUrl, token, (enrollment) =>
    source.startPhoneNode(serverUrl, token, enrollment),
  );
}

export async function stopPhoneNode(): Promise<void> {
  await phoneFor('stopPhoneNode').stopPhoneNode();
}

export async function phoneNodeStatus(): Promise<PhoneNodeStatus> {
  return PHONE_NODE_STATUS.parse(await phoneFor('phoneStatus').phoneStatus());
}

export async function setPhoneSensor(sensor: PhoneSensor, on: boolean): Promise<PhoneNodeStatus> {
  return PHONE_NODE_STATUS.parse(await phoneFor('setPhoneSensor').setPhoneSensor(sensor, on));
}

export async function phoneCarCandidates(): Promise<PhoneCar[]> {
  return PHONE_CARS.parse(await phoneFor('phoneCarCandidates').phoneCarCandidates());
}

export async function choosePhoneCar(address: string): Promise<string> {
  return ASSOCIATION.parse(await phoneFor('choosePhoneCar').choosePhoneCar(address));
}

export async function forgetPhoneCar(): Promise<void> {
  await phoneFor('forgetPhoneCar').forgetPhoneCar();
}

export async function setHomeWifi(useCurrent: boolean): Promise<PhoneNodeStatus> {
  return PHONE_NODE_STATUS.parse(await phoneFor('setHomeWifi').setHomeWifi(useCurrent));
}

export async function parkedSpot(): Promise<ParkedSpot | null> {
  return PARKED_SPOT.parse(await phoneFor('parkedSpot').parkedSpot());
}

export async function openUsageAccess(): Promise<void> {
  await phoneFor('openUsageAccess').openUsageAccess();
}

export async function openAccessibilitySettings(): Promise<void> {
  await phoneFor('openAccessibilitySettings').openAccessibilitySettings();
}

export async function openWriteSettings(): Promise<void> {
  await phoneFor('openWriteSettings').openWriteSettings();
}

export async function openBatteryOptimization(): Promise<void> {
  await phoneFor('openBatteryOptimization').openBatteryOptimization();
}

export function addPhoneEventListener(
  listener: (event: PhoneNativeEvent) => void,
): SyncProgressSubscription {
  return phoneFor('addListener').addListener('onPhoneEvent', (payload) => {
    listener(PHONE_NATIVE_EVENT.parse(payload));
  });
}
