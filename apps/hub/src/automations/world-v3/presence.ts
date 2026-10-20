import { z } from 'zod';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { PERSON_REF, personRefs } from './refs';

export interface PresenceReading {
  readonly id: string;
  readonly name: string;
  readonly guest: boolean;
  readonly home: boolean;
  readonly place: string | null;
  readonly since: string | null;
}

export interface PresenceSource {
  readonly people: () => readonly PresenceReading[];
}

const PRESENCE_PERSON = z.object({ person: PERSON_REF });

const WHO_HOME = z.object({ includeGuests: z.boolean() });

export function presenceHandlers(source: PresenceSource): ReadHandlers {
  return {
    'presence.person': (inputs): ReadResult => {
      const { person: id } = parseInputs('presence.person', PRESENCE_PERSON, inputs);
      const person = source.people().find((entry) => entry.id === id);
      if (person === undefined) throw new ReadFailure('NotFound', `There is no person ${id}`);
      return outputsOf({
        isHome: person.home,
        place: person.place ?? undefined,
        since: person.since ?? undefined,
      });
    },
    'presence.who_home': (inputs): ReadResult => {
      const { includeGuests } = parseInputs('presence.who_home', WHO_HOME, inputs);
      const home = source
        .people()
        .filter((person) => person.home && (includeGuests || !person.guest));
      return outputsOf({
        people: personRefs(home.map((person) => person.id)),
        count: home.length,
        anyone: home.length > 0,
      });
    },
  };
}
