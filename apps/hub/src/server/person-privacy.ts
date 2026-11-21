import {
  UNSET_FITNESS_GOALS,
  type BodyReadingRow,
  type ClientRow,
  type ProfileRow,
} from '@smarteverything/domain';

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
