import type { NetworkClient, ProfileRow } from '@smarteverything/domain';
import { moment } from '../../../format/time';
import { presenceOf } from '../overview/people-model';

export type WidgetProfile = Pick<ProfileRow, 'id' | 'name' | 'colour'>;

export interface WidgetPerson {
  readonly id: string;
  readonly name: string;
  readonly profile: WidgetProfile;
  readonly home: boolean;
  readonly leftAt: string | null;
}

const STACK_MAX = 3;
const NAMED_MAX = 2;

function latestSeen(clients: readonly NetworkClient[], profileId: string): string | null {
  return clients
    .filter((client) => client.profileId === profileId)
    .flatMap((client) => (client.lastSeen === null ? [] : [client.lastSeen]))
    .reduce<string | null>(
      (latest, seen) => (latest === null || Date.parse(seen) > Date.parse(latest) ? seen : latest),
      null,
    );
}

export function widgetPeople(
  clients: readonly NetworkClient[],
  profiles: readonly WidgetProfile[],
): readonly WidgetPerson[] {
  return presenceOf(clients, profiles).flatMap((person) => {
    const profile = profiles.find((candidate) => candidate.id === person.id);
    return profile === undefined
      ? []
      : [{ ...person, profile, leftAt: person.home ? null : latestSeen(clients, person.id) }];
  });
}

export function personLine(person: WidgetPerson, now: number): string {
  if (person.home) {
    return 'Home';
  }
  return person.leftAt === null ? 'Away' : `Away · left ${moment(person.leftAt, now)}`;
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
