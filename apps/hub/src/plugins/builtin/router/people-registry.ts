import {
  KNOWN_PERSON,
  PERSON_ARRIVED_EVENT,
  PERSON_LEFT_EVENT,
  atHomePlace,
  type KnownClient,
  type KnownPerson,
  type PluginEvent,
  type PresencePerson,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PluginRecords } from '../contract';

export interface PhoneSighting {
  readonly paired: boolean;
  readonly place: string | null;
}

export interface PeopleHome {
  readonly profiles: () => readonly { readonly id: string; readonly name: string }[];
  readonly phone: (profileId: string) => PhoneSighting;
}

export class UnknownPersonError extends Error {
  override readonly name = 'UnknownPersonError';

  constructor(readonly personId: string) {
    super(`There is no known person ${personId}; list the people first.`);
  }
}

function linkedTo(person: KnownPerson, client: KnownClient): boolean {
  return (person.profile ? client.profileId : client.personId) === person.id;
}

export class PeopleRegistry {
  readonly #people = new Map<string, KnownPerson>();

  constructor(
    private readonly records: PluginRecords,
    private readonly emit: (event: PluginEvent) => void,
    private readonly home: PeopleHome,
    log: Logger,
  ) {
    for (const { key, value } of records.list()) {
      const parsed = KNOWN_PERSON.safeParse(value);
      if (parsed.success) {
        this.#people.set(parsed.data.id, parsed.data);
      } else {
        log.warn('router.person_record_invalid', { key });
      }
    }
  }

  evaluate(clients: readonly KnownClient[], now: Date): readonly PresencePerson[] {
    this.#syncProfiles();
    const at = now.toISOString();
    return [...this.#people.values()]
      .filter((person) => !person.profile || this.#covered(person, clients))
      .map((person) => this.#judge(person, clients, at))
      .sort(
        (left, right) =>
          Number(right.home) - Number(left.home) || left.name.localeCompare(right.name),
      );
  }

  add(name: string): KnownPerson {
    const person: KnownPerson = {
      id: crypto.randomUUID(),
      name,
      profile: false,
      tracked: true,
      home: false,
      since: null,
    };
    this.#store(person);
    return person;
  }

  rename(id: string, name: string): KnownPerson {
    const person = this.#named(id);
    const renamed = { ...person, name };
    this.#store(renamed);
    return renamed;
  }

  remove(id: string): void {
    this.#named(id);
    this.#people.delete(id);
    this.records.remove(id);
  }

  setTracked(id: string, tracked: boolean): KnownPerson {
    const person = this.resolve(id);
    const changed = tracked ? person : { ...person, home: false, since: null };
    const next = { ...changed, tracked };
    this.#store(next);
    return next;
  }

  resolve(id: string): KnownPerson {
    this.#syncProfiles();
    const person = this.#people.get(id);
    if (person === undefined) {
      throw new UnknownPersonError(id);
    }
    return person;
  }

  byName(name: string): KnownPerson | undefined {
    const wanted = name.trim().toLowerCase();
    return [...this.#people.values()].find(
      (person) => !person.profile && person.name.toLowerCase() === wanted,
    );
  }

  #named(id: string): KnownPerson {
    const person = this.#people.get(id);
    if (person === undefined || person.profile) {
      throw new UnknownPersonError(id);
    }
    return person;
  }

  #covered(person: KnownPerson, clients: readonly KnownClient[]): boolean {
    return clients.some((client) => linkedTo(person, client)) || this.home.phone(person.id).paired;
  }

  #syncProfiles(): void {
    const profiles = new Map(this.home.profiles().map((profile) => [profile.id, profile.name]));
    for (const person of [...this.#people.values()]) {
      if (person.profile && !profiles.has(person.id)) {
        this.#people.delete(person.id);
        this.records.remove(person.id);
      }
    }
    for (const [id, name] of profiles) {
      const known = this.#people.get(id);
      if (known === undefined) {
        this.#store({ id, name, profile: true, tracked: true, home: false, since: null });
      } else if (known.name !== name) {
        this.#store({ ...known, name });
      }
    }
  }

  #judge(person: KnownPerson, clients: readonly KnownClient[], at: string): PresencePerson {
    const devices = clients.filter((client) => linkedTo(person, client));
    const sighting = person.profile ? this.home.phone(person.id) : null;
    const viaPhone = sighting !== null && atHomePlace(sighting.place);
    const home = person.tracked && (viaPhone || devices.some((client) => client.present));
    const settled = home === person.home ? person : this.#moved(person, home, at);
    return {
      id: settled.id,
      name: settled.name,
      profile: settled.profile,
      tracked: settled.tracked,
      home: settled.home,
      since: settled.since,
      viaPhone,
      devices: devices.map(({ mac, name, present }) => ({ mac, name, present })),
    };
  }

  #moved(person: KnownPerson, home: boolean, at: string): KnownPerson {
    const moved = { ...person, home, since: at };
    this.#store(moved);
    this.emit({
      kind: home ? PERSON_ARRIVED_EVENT : PERSON_LEFT_EVENT,
      subject: moved.name,
      data: {
        person_id: moved.id,
        name: moved.name,
        profile_id: moved.profile ? moved.id : null,
      },
    });
    return moved;
  }

  #store(person: KnownPerson): void {
    this.#people.set(person.id, person);
    this.records.put(person.id, { ...person });
  }
}
