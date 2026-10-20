import type { PhoneSettingsPage, PhoneSystemToggle } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { PhoneReadings } from '../phone-values';

export interface ToggleRow {
  readonly capability: PhoneSystemToggle;
  readonly label: string;
  readonly icon: IconName;
  readonly reading: (readings: PhoneReadings) => boolean | null;
}

export interface RadioRow {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly page: PhoneSettingsPage;
  readonly reading: (readings: PhoneReadings) => boolean | null;
}

export const TOGGLE_ROWS: readonly ToggleRow[] = [
  {
    capability: 'auto_rotate',
    label: 'Auto-rotate',
    icon: 'refresh',
    reading: (readings) => readings.autoRotate,
  },
  {
    capability: 'haptic_feedback',
    label: 'Touch vibration',
    icon: 'smartphone',
    reading: (readings) => readings.hapticFeedback,
  },
  {
    capability: 'touch_sounds',
    label: 'Touch sounds',
    icon: 'volume',
    reading: (readings) => readings.touchSounds,
  },
];

export const RADIO_ROWS: readonly RadioRow[] = [
  { key: 'wifi', label: 'Wi-Fi', icon: 'wifi', page: 'wifi', reading: (r) => r.wifiOn },
  {
    key: 'bluetooth',
    label: 'Bluetooth',
    icon: 'bluetooth',
    page: 'bluetooth',
    reading: (r) => r.bluetoothOn,
  },
  {
    key: 'location',
    label: 'Location',
    icon: 'mapPin',
    page: 'location',
    reading: (r) => r.locationOn,
  },
  {
    key: 'airplane',
    label: 'Airplane mode',
    icon: 'radio',
    page: 'airplane',
    reading: (r) => r.airplaneMode,
  },
];

export interface RadioState {
  readonly label: string;
  readonly tone: 'positive' | 'neutral';
}

export function radioStateOf(on: boolean | null): RadioState | null {
  if (on === null) return null;
  return on ? { label: 'On', tone: 'positive' } : { label: 'Off', tone: 'neutral' };
}

export const NEEDS_SETTINGS = 'Allow Modify system settings on the phone to change these here';

export function radioSpoken(row: RadioRow, on: boolean | null): string {
  const state = radioStateOf(on);
  return `${row.label}: ${state === null ? 'not reported' : state.label.toLowerCase()}`;
}
