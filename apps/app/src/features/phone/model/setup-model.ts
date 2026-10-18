import type { PhoneFeature, PhoneFeatureSupport } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export interface FeatureCopy {
  readonly title: string;
  readonly why: string;
  readonly icon: IconName;
}

export const FEATURE_COPY: Readonly<Record<PhoneFeature, FeatureCopy>> = {
  usage: {
    title: 'App usage access',
    why: 'Screen time, data use, storage and app use',
    icon: 'timer',
  },
  notifications: {
    title: 'Notification access',
    why: 'Notification counts and what is playing',
    icon: 'bell',
  },
  dnd: { title: 'Do Not Disturb access', why: 'Silent and Do not disturb', icon: 'bellOff' },
  write_settings: {
    title: 'Modify system settings',
    why: 'Brightness and screen timeout',
    icon: 'sun',
  },
  overlay: { title: 'Display over other apps', why: 'Open apps from here', icon: 'appWindow' },
  bluetooth: {
    title: 'Nearby devices',
    why: 'Connected Bluetooth devices',
    icon: 'bluetooth',
  },
  location: { title: 'Location', why: 'Places and the home Wi-Fi name', icon: 'mapPin' },
  activity: {
    title: 'Physical activity',
    why: 'Walking, driving and cycling',
    icon: 'footprints',
  },
  telephony: { title: 'Phone state', why: 'Mobile signal and calls', icon: 'smartphone' },
  torch: { title: 'Flashlight', why: 'Turn the flashlight on and off', icon: 'flashlight' },
  torch_strength: {
    title: 'Flashlight strength',
    why: 'Choose how bright the flashlight is',
    icon: 'sun',
  },
  fold: { title: 'Foldable screen', why: 'Open or folded state', icon: 'smartphone' },
};

export interface FeatureRow {
  readonly feature: PhoneFeature;
  readonly title: string;
  readonly why: string;
  readonly icon: IconName;
  readonly state: PhoneFeatureSupport['state'];
}

const STATE_ORDER: Readonly<Record<PhoneFeatureSupport['state'], number>> = {
  needs_permission: 0,
  ready: 1,
  unsupported: 2,
};

export function featureRowsOf(features: readonly PhoneFeatureSupport[]): readonly FeatureRow[] {
  return features
    .map((support) => ({
      feature: support.feature,
      state: support.state,
      ...FEATURE_COPY[support.feature],
    }))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

export function allowedCount(rows: readonly FeatureRow[]): string {
  const usable = rows.filter((row) => row.state !== 'unsupported');
  const ready = usable.filter((row) => row.state === 'ready').length;
  return `${String(ready)} of ${String(usable.length)} allowed`;
}
