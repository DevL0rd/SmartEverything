import { PermissionsAndroid, Platform } from 'react-native';
import { openBatteryOptimization } from '../../../../modules/health-connect';
import {
  openAssistantSettings,
  openOverlaySettings,
  overlayStatus,
} from '../overlay/overlay-native';

export interface PhoneAssistantNative {
  readonly assistantChosen: () => boolean | null;
  readonly overlayAllowed: () => boolean | null;
  readonly batteryUnrestricted: () => boolean | null;
  readonly microphoneAllowed: () => Promise<boolean | null>;
  readonly openAssistantSettings: () => Promise<void>;
  readonly openOverlaySettings: () => Promise<void>;
  readonly openBatterySettings: () => Promise<void>;
  readonly openSideKeySettings: (() => Promise<void>) | null;
}

async function microphoneAllowed(): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
}

export const phoneAssistantNative: PhoneAssistantNative = {
  assistantChosen: () => overlayStatus()?.assistantRole ?? null,
  overlayAllowed: () => overlayStatus()?.canDrawOverlays ?? null,
  batteryUnrestricted: () => overlayStatus()?.batteryUnrestricted ?? null,
  microphoneAllowed,
  openAssistantSettings,
  openOverlaySettings,
  openBatterySettings: openBatteryOptimization,
  openSideKeySettings: null,
};
