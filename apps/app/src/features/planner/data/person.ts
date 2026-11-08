import type { StoreState } from '../../../store/state';

export type PlannerPerson = string | null;

export function apiPerson(person: PlannerPerson): string | undefined {
  return person ?? undefined;
}

export function profileIn(state: StoreState, person: PlannerPerson): string | null {
  return person ?? state.session?.client.profile_id ?? null;
}
