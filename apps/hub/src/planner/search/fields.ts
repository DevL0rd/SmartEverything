import type { PlannerGuestRow, PlannerItemRow, PlannerSearchField } from '@smarteverything/domain';
import { fold, startsAWord } from './fold';

export interface Searchable {
  readonly item: PlannerItemRow;
  readonly calendar: string | null;
  readonly guests: readonly string[];
}

export function guestTexts(
  guests: readonly PlannerGuestRow[],
  nameOf: (profileId: string) => string | undefined,
): string[] {
  return guests.flatMap((guest) => {
    const named = guest.profile_id === null ? undefined : nameOf(guest.profile_id);
    return [named, guest.name, guest.email].filter((text) => text !== undefined && text !== null);
  });
}

function fieldsOf(searchable: Searchable): readonly (readonly [PlannerSearchField, string])[] {
  const { item, calendar, guests } = searchable;
  return [
    ['title', fold(item.title)],
    ['notes', fold(item.notes)],
    ['location', fold(item.location ?? '')],
    ['guest', guests.map(fold).join('\n')],
    ['calendar', fold(calendar ?? '')],
  ];
}

export function matchedFields(
  searchable: Searchable,
  tokens: readonly string[],
): PlannerSearchField[] | null {
  const fields = fieldsOf(searchable);
  const found = new Set<PlannerSearchField>();
  for (const token of tokens) {
    const where = fields.filter(([, text]) => startsAWord(text, token));
    if (where.length === 0) return null;
    for (const [name] of where) found.add(name);
  }
  return [...found];
}
