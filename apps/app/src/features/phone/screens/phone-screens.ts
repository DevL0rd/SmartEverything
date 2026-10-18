import type { ReactNode } from 'react';
import { PhoneActivityScreen } from './activity-screen';
import { PhoneAppsScreen } from './apps-screen';
import { PhoneBatteryScreen } from './battery-screen';
import { PhoneOverviewScreen } from './overview-screen';
import { PhoneSetupScreen } from './setup-screen';
import { PhoneNotificationsScreen } from './notifications-screen';
import { PhoneNetworkScreen } from './network-screen';
import { PhoneScreenScreen } from './screen-screen';
import { PhoneSoundScreen } from './sound-screen';
import { PhoneStorageScreen } from './storage-screen';

export type PhoneScreen = (props: { readonly deviceId: string }) => ReactNode;

export const PHONE_SCREENS: Readonly<Record<string, PhoneScreen>> = {
  overview: PhoneOverviewScreen,
  battery: PhoneBatteryScreen,
  activity: PhoneActivityScreen,
  setup: PhoneSetupScreen,
  notifications: PhoneNotificationsScreen,
  apps: PhoneAppsScreen,
  sound: PhoneSoundScreen,
  screen: PhoneScreenScreen,
  network: PhoneNetworkScreen,
  storage: PhoneStorageScreen,
};
