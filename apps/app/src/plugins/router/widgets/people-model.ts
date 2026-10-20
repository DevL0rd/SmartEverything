import { ACCENTS, type PresencePerson, type ProfileRow } from '@smarteverything/domain';
import { moment } from '../../../format/time';

export type WidgetProfile = Pick<ProfileRow, 'id' | 'name' | 'colour'>;

export interface WidgetPerson {
  readonly id: string;
  readonly name: string;
  readonly profile: Pick<ProfileRow, 'name' | 'colour'>;
  readonly home: boolean;
  readonly since: string | null;
}

const STACK_MAX = 3;
const NAMED_MAX = 2;

export function accentOfPerson(id: string): ProfileRow['colour'] {
  const sum = Array.from(id, (character) => character.charCodeAt(0)).reduce(
    (total, code) => total + code,
    0,
  );
  return ACCENTS[sum % ACCENTS.length] ?? 'aqua';
}

export function widgetPeople(
  people: readonly PresencePerson[],
  profiles: readonly WidgetProfile[],
): readonly WidgetPerson[] {
  return people
    .filter((person) => person.tracked)
    .map((person) => ({
      id: person.id,
      name: person.name,
      profile: {
        name: person.name,
        colour:
          profiles.find((profile) => profile.id === person.id)?.colour ?? accentOfPerson(person.id),
      },
      home: person.home,
      since: person.since,
    }));
}

export function personLine(person: WidgetPerson, now: number): string {
  if (person.since === null) {
    return person.home ? 'Home' : 'Away';
  }
  const when = moment(person.since, now);
  return person.home ? `Home · arrived ${when}` : `Away · left ${when}`;
}

export function homeLine(people: readonly WidgetPerson[]): string {
  const home = people.filter((person) => person.home);
  if (home.length === 0) {
    return 'Nobody home';
  }
  return home.length <= NAMED_MAX
    ? `${home.map((person) => person.name).join(', ')} home`
    : `${String(home.length)} home`;
}

export function homeStack(people: readonly WidgetPerson[]): {
  readonly shown: readonly WidgetPerson[];
  readonly more: number;
} {
  const home = people.filter((person) => person.home);
  return { shown: home.slice(0, STACK_MAX), more: Math.max(0, home.length - STACK_MAX) };
}

export function fitRows(
  people: readonly WidgetPerson[],
  capacity: number,
): { readonly shown: readonly WidgetPerson[]; readonly more: number } {
  if (people.length <= capacity) {
    return { shown: people, more: 0 };
  }
  const shown = people.slice(0, Math.max(1, capacity - 1));
  return { shown, more: people.length - shown.length };
}

const ROW_HEIGHT = 48;

export function rowCapacity(body: number, reserved: number): number {
  return Math.max(1, Math.floor((body - reserved) / ROW_HEIGHT));
}
