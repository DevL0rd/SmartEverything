import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { Logger } from '@smarteverything/logging';
import {
  choosePhoneCar,
  forgetPhoneCar,
  openBatteryOptimization,
  openDndAccess,
  openNotificationAccess,
  openUsageAccess,
  setHomeWifi,
  setPhoneSensor,
  type PhoneSensor,
} from '../../../modules/health-connect';
import { changePhoneNode } from './phone-node';

const log = new Logger('app.phone');

const RUNTIME_MOTION_API = 29;

function androidApi(): number {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' ? Platform.Version : 0;
}

async function granted(
  permission: Parameters<typeof PermissionsAndroid.request>[0],
): Promise<boolean> {
  const answer = await PermissionsAndroid.request(permission);
  log.info('phone.permission_answered', { permission, answer });
  if (answer === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    await Linking.openSettings();
  }
  return answer === PermissionsAndroid.RESULTS.GRANTED;
}

async function allowMotion(): Promise<boolean> {
  return (
    androidApi() < RUNTIME_MOTION_API ||
    granted(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION)
  );
}

const ALLOWERS: Readonly<Partial<Record<PhoneSensor, () => Promise<boolean>>>> = {
  activity: allowMotion,
};

export async function switchSensor(sensor: PhoneSensor, on: boolean): Promise<void> {
  await changePhoneNode(async () => {
    const allow = ALLOWERS[sensor];
    if (on && allow !== undefined && !(await allow())) {
      return;
    }
    await setPhoneSensor(sensor, on);
  });
}

export async function allowScreenTime(): Promise<void> {
  await changePhoneNode(async () => {
    await setPhoneSensor('screen_time', true);
    await openUsageAccess();
  });
}

export async function allowNavigation(): Promise<void> {
  await changePhoneNode(async () => {
    await setPhoneSensor('navigation', true);
    await openNotificationAccess();
  });
}

export async function allowSoundControl(): Promise<void> {
  await changePhoneNode(openDndAccess);
}

export async function keepRunning(): Promise<void> {
  await changePhoneNode(openBatteryOptimization);
}

export async function allowWifiName(): Promise<void> {
  await changePhoneNode(() => granted(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION));
}

export async function changeHomeWifi(useCurrent: boolean): Promise<void> {
  await changePhoneNode(() => setHomeWifi(useCurrent));
}

export async function chooseCar(address: string): Promise<void> {
  await changePhoneNode(async () => {
    const outcome = await choosePhoneCar(address);
    log.info('phone.car_answered', { outcome });
  });
}

export async function forgetCar(): Promise<void> {
  await changePhoneNode(forgetPhoneCar);
}
