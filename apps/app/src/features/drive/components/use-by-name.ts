import { useActiveProfile, useProfiles } from '../../../store/people';
import type { ByName } from '../../files';

export function useByName(): ByName {
  const names = new Map(useProfiles().map((profile) => [profile.id, profile.name] as const));
  const me = useActiveProfile()?.id ?? null;
  return (profileId) => {
    if (profileId === null) return null;
    return profileId === me ? 'You' : (names.get(profileId) ?? null);
  };
}
