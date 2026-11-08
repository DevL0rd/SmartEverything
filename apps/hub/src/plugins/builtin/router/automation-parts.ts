import type { FlowType } from '@smarteverything/domain';
import { entity, type PortKind } from '../automation-kit';
import { CLIENT_JOINED_EVENT, CLIENT_LEFT_EVENT } from './client-registry';
import { PERSON_ARRIVED_EVENT, PERSON_FIELDS, PERSON_LEFT_EVENT } from './people-events';

export const PLUGIN = 'router';
export const CLIENT_PICKER = 'clients';
export const PEOPLE_PICKER = 'people';

const CLIENT_FIELDS = {
  mac: 'string',
  name: 'string',
  profile_id: 'string',
  person_id: 'string',
} as const;

export const CLIENT_JOINED = {
  kind: CLIENT_JOINED_EVENT,
  title: 'Device joined the network',
  fields: CLIENT_FIELDS,
} as const;

export const CLIENT_LEFT = {
  kind: CLIENT_LEFT_EVENT,
  title: 'Device left the network',
  fields: CLIENT_FIELDS,
} as const;

export const PERSON_ARRIVED = {
  kind: PERSON_ARRIVED_EVENT,
  title: 'A person arrives home',
  fields: PERSON_FIELDS,
} as const;

export const PERSON_LEFT = {
  kind: PERSON_LEFT_EVENT,
  title: 'A person leaves home',
  fields: PERSON_FIELDS,
} as const;

export const CLIENT = entity(PLUGIN, {
  id: 'client',
  title: 'Network device',
  plural: 'Network devices',
  options: CLIENT_PICKER,
});

export const PERSON = entity(PLUGIN, {
  id: 'person',
  title: 'Person',
  plural: 'People',
  options: PEOPLE_PICKER,
});

export const INSTANT: PortKind<string> = { type: { t: 'instant' } };

export const CONNECTIONS = [
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'wired', label: 'Wired' },
] as const;

export function maybe<V>(kind: PortKind<V>): PortKind<V | undefined> {
  return { type: { t: 'optional', of: kind.type } };
}

export function record(fields: Readonly<Record<string, PortKind<unknown>>>): PortKind<unknown> {
  const typed: Record<string, FlowType> = {};
  for (const [name, kind] of Object.entries(fields)) typed[name] = kind.type;
  return { type: { t: 'record', fields: typed } };
}
