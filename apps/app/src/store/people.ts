import type { BodyReadingRow, ProfileRow } from '@smarteverything/domain';
import { useMemo } from 'react';
import { DAY_MS } from '../format/time';
import { memoOnInputs } from './memo-selector';
import { useRow, useRows, useSession } from './selectors';
import { rowsOf, type Device, type StoreState } from './state';
import { shallowEqual, useStoreSelector } from './store-context';

const PENDING_DAYS = 7;

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

export function bodyReadingsOf(
  profileId: string | null,
): (state: StoreState) => readonly WeighedReading[] {
  return memoOnInputs(
    (state) => [state.tables.body_readings],
    (state) =>
      rowsOf(state.tables.body_readings).filter(
        (reading): reading is WeighedReading =>
          reading.profile_id === profileId && counted(reading) && weighed(reading),
      ),
  );
}

export function useBodyReadings(profileId: string | null): readonly WeighedReading[] {
  const select = useMemo(() => bodyReadingsOf(profileId), [profileId]);
  return useStoreSelector(select, shallowEqual);
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
