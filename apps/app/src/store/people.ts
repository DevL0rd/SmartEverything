import type { BodyReadingRow, ProfileRow } from '@smarteverything/domain';
import { useRow, useRows, useSession } from './selectors';
import type { Device } from './state';
import type { StoreState } from './state';

const PENDING_DAYS = 7;
const DAY_MS = 86_400_000;

export function useProfiles(): readonly ProfileRow[] {
  return useRows('profiles');
}

export function useActiveProfile(): ProfileRow | null {
  return useRow('profiles', useSession().client.profile_id);
}

export function activeProfileIn(state: StoreState): ProfileRow | null {
  const id = state.session?.client.profile_id ?? null;
  return id === null ? null : (state.tables.profiles.byId[id] ?? null);
}

export function counted(reading: BodyReadingRow): boolean {
  return reading.attribution !== 'pending' && reading.attribution !== 'ignored';
}

export type WeighedReading = BodyReadingRow & { readonly weight_kg: number };

function weighed(reading: BodyReadingRow): reading is WeighedReading {
  return reading.weight_kg !== null;
}

export function useBodyReadings(profileId: string | null): readonly WeighedReading[] {
  return useRows('body_readings').filter(
    (reading): reading is WeighedReading =>
      reading.profile_id === profileId && counted(reading) && weighed(reading),
  );
}

export function usePendingReadings(now: number): readonly WeighedReading[] {
  return useRows('body_readings').filter(
    (reading): reading is WeighedReading =>
      reading.attribution === 'pending' &&
      weighed(reading) &&
      now - Date.parse(reading.measured_at) < PENDING_DAYS * DAY_MS,
  );
}

const SCALE_PREFIX = 'xiaomi_scale:';

export function isLocalScale(device: Pick<Device, 'provider' | 'external_id'>): boolean {
  return device.provider === 'local' && device.external_id.startsWith(SCALE_PREFIX);
}
