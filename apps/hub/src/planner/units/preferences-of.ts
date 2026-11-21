import type { PlannerPreferences } from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import { DEFAULT_PREFERENCES } from '../preferences';

export function plannerPreferencesOf(
  store: Pick<HostStore, 'plannerPreferences'>,
  profileId: string,
): PlannerPreferences {
  return store.plannerPreferences.find(profileId)?.preferences ?? DEFAULT_PREFERENCES;
}
