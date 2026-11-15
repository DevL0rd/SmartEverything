export type PlannerPersonId = string | undefined;

export function plannerPersonQuery(personId: PlannerPersonId): { readonly personId?: string } {
  return personId === undefined ? {} : { personId };
}
