import {
  BODY_READINGS_SNAPSHOT,
  UNSET_FITNESS_GOALS,
  type BodyReadingRow,
  type ClientRow,
  type ProfileRow,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface Viewer {
  readonly role: ClientRow['role'];
  readonly profileId: string;
}

export function readingVisibleTo(
  viewer: Viewer,
  reading: Pick<BodyReadingRow, 'profile_id'>,
): boolean {
  return (
    viewer.role === 'owner' ||
    reading.profile_id === null ||
    reading.profile_id === viewer.profileId
  );
}

export function profileSeenBy(viewer: Viewer, profile: ProfileRow): ProfileRow {
  if (viewer.role === 'owner' || profile.id === viewer.profileId) return profile;
  return {
    ...profile,
    sex: null,
    birth_date: null,
    height_cm: null,
    fitness_goals: UNSET_FITNESS_GOALS,
    max_heart_rate: null,
  };
}

export function bodyTables(
  store: Pick<Store, 'profiles' | 'bodyReadings'>,
  viewer: Viewer,
): { readonly profiles: ProfileRow[]; readonly body_readings: BodyReadingRow[] } {
  return {
    profiles: store.profiles.list().map((profile) => profileSeenBy(viewer, profile)),
    body_readings: store.bodyReadings
      .recent(BODY_READINGS_SNAPSHOT)
      .filter((reading) => readingVisibleTo(viewer, reading)),
  };
}
