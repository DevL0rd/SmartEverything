import type { PlannerGuestSuggestion } from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function suggestGuests(
  store: Pick<HostStore, 'plannerGuests'>,
  profileId: string,
  text: string,
): PlannerGuestSuggestion[] {
  const words = fold(text)
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  return store.plannerGuests
    .emailContacts(profileId)
    .filter((contact) => {
      const haystack = fold(`${contact.name ?? ''} ${contact.email}`);
      return words.every((word) => haystack.includes(word));
    })
    .map((contact) => ({ email: contact.email, name: contact.name }));
}
