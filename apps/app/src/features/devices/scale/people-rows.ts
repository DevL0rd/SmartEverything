import type { ProfileRow } from '@smarteverything/domain';
import type { Person } from './people';
import type { WeighIn } from './weigh-ins';

export interface PeopleRow {
  readonly profile: ProfileRow;
  readonly slot: string;
  readonly last: WeighIn | null;
}

export const NO_SLOT_TEXT = 'Not linked to a slot on the scale';

export function slotText(slot: number | null): string {
  return slot === null ? NO_SLOT_TEXT : `Slot ${String(slot)}`;
}

export function peopleRows(
  profiles: readonly ProfileRow[],
  people: readonly Person[],
): readonly PeopleRow[] {
  return profiles
    .map((profile) => ({
      profile,
      slot: slotText(profile.scale_user),
      last: people.find((person) => person.profile.id === profile.id)?.weighIns.at(-1) ?? null,
    }))
    .filter((row) => row.last !== null || row.profile.scale_user !== null)
    .sort((left, right) => (right.last?.at ?? 0) - (left.last?.at ?? 0));
}
