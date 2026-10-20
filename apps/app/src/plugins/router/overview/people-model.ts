import type { PresencePerson } from '@smarteverything/domain';
import { plural } from '../../../format/text';

export function trackedPeople(people: readonly PresencePerson[]): readonly PresencePerson[] {
  return people.filter((person) => person.tracked);
}

export function presenceLine(presence: readonly PresencePerson[]): string {
  return presence.map((person) => `${person.name} ${person.home ? 'home' : 'away'}`).join(' · ');
}

export function presenceLabel(presence: readonly PresencePerson[]): string {
  const home = presence.filter((person) => person.home).length;
  return `People home: ${plural(home, 'person', 'people')} of ${String(presence.length)}. ${presenceLine(presence)}`;
}
