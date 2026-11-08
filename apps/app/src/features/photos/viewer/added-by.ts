import { useActiveProfile, useProfiles } from '../../../store/people';

export interface Person {
  readonly id: string;
  readonly name: string;
}

export function addedByName(
  profileId: string | null,
  people: readonly Person[],
  me: string | null,
): string | null {
  if (profileId === null) return null;
  if (profileId === me) return 'You';
  return people.find((person) => person.id === profileId)?.name ?? null;
}

export function useAddedBy(profileId: string | null): string | null {
  const people = useProfiles();
  const me = useActiveProfile()?.id ?? null;
  return addedByName(profileId, people, me);
}
