import { useEffect } from 'react';
import { AppState } from 'react-native';
import { background } from '@smarteverything/logging';
import {
  batteryOptimizationIgnored,
  fullScreenAlarmAllowed,
  openBatterySettings,
  openFullScreenAlarmSettings,
  plannerLinked,
} from '../../../../modules/health-connect';
import { ValueStore, useValue } from '../../../design/external-store';
import { UNKNOWN_ALARM_PHONE, type AlarmPhoneFacts } from '../model/facts';
import type { SystemSetting } from '../model/items';

const alarmPhone = new ValueStore<AlarmPhoneFacts>(UNKNOWN_ALARM_PHONE);

const OPENERS: Readonly<Record<SystemSetting, () => Promise<void>>> = {
  full_screen_alarms: openFullScreenAlarmSettings,
  background_alarms: openBatterySettings,
};

async function refreshAlarmPhone(): Promise<void> {
  const [fullScreen, unrestricted] = await Promise.all([
    fullScreenAlarmAllowed(),
    batteryOptimizationIgnored(),
  ]);
  const current = alarmPhone.get();
  if (current.fullScreen === fullScreen && current.unrestricted === unrestricted) return;
  alarmPhone.set({ fullScreen, unrestricted });
}

export function useAlarmPhone(): AlarmPhoneFacts {
  useEffect(() => {
    if (!plannerLinked()) return undefined;
    background(refreshAlarmPhone(), 'setup.alarm_phone_failed');
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') background(refreshAlarmPhone(), 'setup.alarm_phone_failed');
    });
    return (): void => {
      subscription.remove();
    };
  }, []);
  return useValue(alarmPhone);
}

export async function openSystemSetting(setting: SystemSetting): Promise<void> {
  await OPENERS[setting]();
}
