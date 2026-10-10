import { isPrivate, privacySwitchOf, type CamerasPref } from '@smarteverything/domain';
import { PREFS, usePref } from '../../../store/prefs';
import { useDeviceValue } from '../../../store/selectors';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import type { CameraEntry } from '../logic/cameras';
import type { CameraCondition } from '../player/player-state';
import { useCameraReach } from './use-cameras';

function useLastSeen(deviceId: string): string | null {
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.events).find(
        (event) => event.device_id === deviceId && event.kind === 'device_offline',
      )?.occurred_at ?? null,
  );
}

export function useCameraCondition(entry: CameraEntry): CameraCondition {
  const privacy = privacySwitchOf(entry.device);
  const value = useDeviceValue(entry.device.id, privacy?.key ?? 'privacy_mode');
  const reach = useCameraReach(entry.device.id);
  return {
    online: entry.device.online,
    lastSeen: useLastSeen(entry.device.id),
    privacy: privacy !== null && isPrivate(privacy, value?.value),
    reach: reach?.state ?? null,
  };
}

export function useRemoteConfigured(): boolean {
  return useStoreSelector(
    (state) =>
      (state.settings?.ice_servers.length ?? 0) > 0 ||
      (state.settings?.webrtc_candidates.length ?? 0) > 0,
  );
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
