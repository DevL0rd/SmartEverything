import type { NetworkClient } from '@smarteverything/domain';
import { plural } from '../../../format/text';

export interface PersonPresence {
  readonly id: string;
  readonly name: string;
  readonly home: boolean;
}

export function presenceOf(
  clients: readonly NetworkClient[],
  people: readonly { readonly id: string; readonly name: string }[],
): readonly PersonPresence[] {
  return people
    .flatMap((person) => {
      const owned = clients.filter((client) => client.profileId === person.id);
      return owned.length === 0
        ? []
        : [{ id: person.id, name: person.name, home: owned.some((client) => client.connected) }];
    })
    .sort((left, right) => Number(right.home) - Number(left.home));
}

export function presenceLine(presence: readonly PersonPresence[]): string {
  return presence.map((person) => `${person.name} ${person.home ? 'home' : 'away'}`).join(' · ');
}

export function presenceLabel(presence: readonly PersonPresence[]): string {
  const home = presence.filter((person) => person.home).length;
  return `People home: ${plural(home, 'person', 'people')} of ${String(presence.length)}. ${presenceLine(presence)}`;
}
