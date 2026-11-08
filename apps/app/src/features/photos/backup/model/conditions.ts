import type { PhotosBackupPref } from '@smarteverything/domain';
import type { Conditions } from './types';

export type PauseReason = 'user' | 'offline' | 'wifi' | 'charging';

export type ConditionSettings = Pick<PhotosBackupPref, 'wifiOnly' | 'chargingOnly'>;

export function blockedBy(
  settings: ConditionSettings,
  conditions: Conditions,
): Exclude<PauseReason, 'user'> | null {
  if (!conditions.connected) return 'offline';
  if (settings.wifiOnly && (!conditions.wifi || conditions.metered)) return 'wifi';
  if (settings.chargingOnly && !conditions.charging) return 'charging';
  return null;
}

export const PAUSE_LABELS = {
  user: 'Paused',
  offline: 'Waiting for a connection',
  wifi: 'Waiting for Wi-Fi',
  charging: 'Waiting for the charger',
} as const satisfies Readonly<Record<PauseReason, string>>;
