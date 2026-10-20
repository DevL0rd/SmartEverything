import type { KnownClient, KnownPerson, PresencePerson } from '@smarteverything/domain';
import type { ClientLink } from './client-registry';
import type { PeopleRegistry } from './people-registry';

export class UnknownDeviceError extends Error {
  override readonly name = 'UnknownDeviceError';

  constructor(readonly mac: string) {
    super(`The router has never seen the device ${mac}; list the network devices first.`);
  }
}

export type PersonChange =
  | { readonly action: 'add'; readonly name: string }
  | { readonly action: 'rename'; readonly person: string; readonly name: string }
  | { readonly action: 'remove'; readonly person: string }
  | { readonly action: 'track'; readonly person: string; readonly tracked: boolean };

export interface DeviceLink {
  readonly mac: string;
  readonly person: string | null;
  readonly newPerson: string | null;
}

export interface PeopleControls {
  readonly list: () => readonly PresencePerson[];
  readonly manage: (change: PersonChange) => KnownPerson;
  readonly link: (link: DeviceLink) => KnownClient;
}

interface PeopleControlPorts {
  readonly people: PeopleRegistry;
  readonly current: () => readonly PresencePerson[];
  readonly known: () => readonly KnownClient[];
  readonly assign: (mac: string, link: ClientLink) => KnownClient | null;
  readonly refresh: () => void;
}

const NO_LINK: ClientLink = { profileId: null, personId: null };

function linkOf(person: KnownPerson | null): ClientLink {
  if (person === null) {
    return NO_LINK;
  }
  return person.profile
    ? { profileId: person.id, personId: null }
    : { profileId: null, personId: person.id };
}

export function peopleControls(ports: PeopleControlPorts): PeopleControls {
  const { people } = ports;
  const target = (link: DeviceLink): KnownPerson | null => {
    if (link.newPerson !== null) {
      return people.byName(link.newPerson) ?? people.add(link.newPerson);
    }
    return link.person === null ? null : people.resolve(link.person);
  };
  return {
    list: ports.current,
    manage: (change): KnownPerson => {
      const done = applyChange(people, change);
      if (change.action === 'remove') {
        ports
          .known()
          .filter((client) => client.personId === change.person)
          .forEach((client) => ports.assign(client.mac, NO_LINK));
      }
      ports.refresh();
      return done;
    },
    link: (link): KnownClient => {
      if (!ports.known().some((client) => client.mac === link.mac)) {
        throw new UnknownDeviceError(link.mac);
      }
      const assigned = ports.assign(link.mac, linkOf(target(link)));
      if (assigned === null) {
        throw new UnknownDeviceError(link.mac);
      }
      ports.refresh();
      return assigned;
    },
  };
}

function applyChange(people: PeopleRegistry, change: PersonChange): KnownPerson {
  switch (change.action) {
    case 'add':
      return people.byName(change.name) ?? people.add(change.name);
    case 'rename':
      return people.rename(change.person, change.name);
    case 'remove': {
      const removed = people.resolve(change.person);
      people.remove(change.person);
      return removed;
    }
    case 'track':
      return people.setTracked(change.person, change.tracked);
  }
}
