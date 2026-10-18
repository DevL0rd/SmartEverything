import { isPrivate, privacySwitchOf, type CamerasPref } from '@smarteverything/domain';
import { PREFS, usePref } from '../../../store/prefs';
import { useDeviceValue } from '../../../store/selectors';
import { useLastSeen } from '../../devices';
import type { CameraEntry } from '../logic/cameras';
import type { CameraCondition } from '../player/player-state';
import { useCameraReach } from './use-cameras';

export function useCameraCondition(entry: CameraEntry): CameraCondition {
  const privacy = privacySwitchOf(entry.device);
  const value = useDeviceValue(entry.device.id, privacy?.key ?? 'privacy_mode');
  const reach = useCameraReach(entry.device.id);
  return {
    online: entry.device.online,
    lastSeen: useLastSeen(entry.device.id)?.at ?? null,
    privacy: privacy !== null && isPrivate(privacy, value?.value),
    reach: reach?.state ?? null,
  };
}

export interface CameraPrefs {
  readonly value: CamerasPref;
  readonly set: (change: Partial<CamerasPref>) => void;
  readonly problem: { readonly reason: string; readonly reset: () => void } | null;
}

export function useCameraPrefs(): CameraPrefs {
  const pref = usePref(PREFS.cameras);
  if (pref.status === 'invalid') {
    return {
      value: PREFS.cameras.defaultValue,
      set: (): void => {
        pref.reset();
      },
      problem: { reason: pref.reason, reset: pref.reset },
    };
  }
  return {
    value: pref.value,
    set: (change): void => {
      pref.set({ ...pref.value, ...change });
    },
    problem: null,
  };
}
