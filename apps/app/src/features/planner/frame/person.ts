import { ValueStore, useValue } from '../../../design/external-store';
import { useIsOwner, useRows } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import type { PlannerPerson } from '../data';

const selectMe = (state: StoreState): string | null => state.session?.client.profile_id ?? null;

export const shownPlannerPerson = new ValueStore<PlannerPerson>(null);

export function showPlannerPerson(person: PlannerPerson): void {
  shownPlannerPerson.set(person);
}

export function shownPersonFor(owner: boolean, chosen: PlannerPerson): PlannerPerson {
  return owner ? chosen : null;
}

export function usePlannerShownPerson(): PlannerPerson {
  return shownPersonFor(useIsOwner(), useValue(shownPlannerPerson));
}

export interface PersonChoice {
  readonly person: PlannerPerson;
  readonly name: string;
  readonly shown: boolean;
}

interface Profile {
  readonly id: string;
  readonly name: string;
}

export function personChoicesOf(
  profiles: readonly Profile[],
  me: string | null,
  shown: PlannerPerson,
): readonly PersonChoice[] {
  const current = shown ?? me;
  return profiles.map((profile) => ({
    person: profile.id === me ? null : profile.id,
    name: profile.name,
    shown: profile.id === current,
  }));
}

export function usePersonChoices(): readonly PersonChoice[] {
  const owner = useIsOwner();
  const profiles = useRows('profiles');
  const me = useStoreSelector(selectMe);
  const shown = useValue(shownPlannerPerson);
  return owner && profiles.length > 1 ? personChoicesOf(profiles, me, shown) : [];
}
