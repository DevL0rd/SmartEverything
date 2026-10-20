import { z } from 'zod';
import { MAC_ADDRESS } from './mac-address';
import { PROFILE_NAME } from './profiles';

export const HOME_PLACE_NAME = 'home';

export const PERSON_NAME = PROFILE_NAME;

export const KNOWN_PERSON = z.strictObject({
  id: z.uuid(),
  name: PERSON_NAME,
  profile: z.boolean(),
  tracked: z.boolean(),
  home: z.boolean(),
  since: z.iso.datetime({ offset: true }).nullable(),
});

export type KnownPerson = z.output<typeof KNOWN_PERSON>;

const PERSON_DEVICE = z.strictObject({
  mac: MAC_ADDRESS,
  name: z.string(),
  present: z.boolean(),
});

export const PRESENCE_PERSON = z.strictObject({
  id: z.uuid(),
  name: PERSON_NAME,
  profile: z.boolean(),
  tracked: z.boolean(),
  home: z.boolean(),
  since: z.iso.datetime({ offset: true }).nullable(),
  viaPhone: z.boolean(),
  devices: z.array(PERSON_DEVICE),
});

export type PresencePerson = z.output<typeof PRESENCE_PERSON>;

export const PERSON_ARRIVED_EVENT = 'person_arrived';
export const PERSON_LEFT_EVENT = 'person_left';

export function atHomePlace(place: string | null): boolean {
  return place?.trim().toLowerCase() === HOME_PLACE_NAME;
}
