import {
  ApiError,
  PLUGIN_PEOPLE_MAX,
  type PluginDataPoint,
  type PluginManifest,
  type PluginPerson,
  type PluginPersonChange,
  type PluginPersonStatus,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { searchHitsOf } from './search-hits';

const OWNER_NEEDS_OWNER_PERSON = 'The owner of a plugin must be one of the home’s owner people.';

const OWNER_PERSON_IS_THE_OWNER =
  'An owner person of the home can only be the owner of a plugin; link a member person to an approved person.';

export interface PluginPersonSave {
  readonly pluginId: string;
  readonly externalId: string;
  readonly change: PluginPersonChange;
}

type PeopleStore = Pick<HostStore, 'plugins' | 'pluginPeople' | 'personAccess'>;

function assertMayBe(store: PeopleStore, profileId: string, status: PluginPersonStatus): void {
  const standing = store.personAccess.standing(profileId);
  if (!standing.known) {
    throw new ApiError('not_found', `That home person cannot be used (${standing.reason}).`);
  }
  if (status === 'owner' && standing.role !== 'owner') {
    throw new ApiError('invalid_request', OWNER_NEEDS_OWNER_PERSON);
  }
  if (status === 'approved' && standing.role === 'owner') {
    throw new ApiError('invalid_request', OWNER_PERSON_IS_THE_OWNER);
  }
}

function keptProfile(
  store: PeopleStore,
  status: PluginPersonStatus,
  known: PluginPerson | undefined,
): string | null {
  const kept = known?.status === status ? known.profile_id : null;
  return kept ?? (status === 'owner' ? store.personAccess.homeOwner() : null);
}

function mappedProfile(
  store: PeopleStore,
  change: PluginPersonChange,
  known: PluginPerson | undefined,
): string | null {
  const profileId =
    change.profile_id === undefined ? keptProfile(store, change.status, known) : change.profile_id;
  if (profileId === null && change.status === 'owner') {
    throw new ApiError('invalid_request', OWNER_NEEDS_OWNER_PERSON);
  }
  if (profileId !== null) assertMayBe(store, profileId, change.status);
  return profileId;
}

export function savePluginPerson(
  store: PeopleStore,
  { pluginId, externalId, change }: PluginPersonSave,
): PluginPerson {
  const plugin = store.plugins.byId(pluginId);
  const people = store.pluginPeople.list(pluginId);
  const known = people.find((person) => person.external_id === externalId);
  if (known === undefined && people.length >= PLUGIN_PEOPLE_MAX) {
    throw new ApiError(
      'invalid_request',
      `${plugin.manifest.name} already has ${String(PLUGIN_PEOPLE_MAX)} people; remove some first.`,
    );
  }
  const owner = people.find((person) => person.status === 'owner');
  if (change.status === 'owner' && owner !== undefined && owner.external_id !== externalId) {
    throw new ApiError(
      'conflict',
      `${owner.name} is already the owner in ${plugin.manifest.name}; make them approved first.`,
    );
  }
  return store.pluginPeople.save(pluginId, externalId, {
    name: change.name,
    status: change.status,
    profile_id: mappedProfile(store, change, known),
  });
}

export function removePluginPerson(
  store: PeopleStore,
  { pluginId, externalId }: { readonly pluginId: string; readonly externalId: string },
): void {
  store.plugins.byId(pluginId);
  if (!store.pluginPeople.remove(pluginId, externalId)) {
    throw new ApiError('not_found', `That person is not approved in this plugin.`);
  }
}

export function listPluginPeople(store: PeopleStore, pluginId: string): PluginPerson[] {
  store.plugins.byId(pluginId);
  return store.pluginPeople.list(pluginId);
}

export interface PluginDataQuery {
  readonly pluginId: string;
  readonly stream: string | undefined;
  readonly limit: number;
}

export const PLUGIN_SEARCH_HITS_UNIT = storeUnit((store, _input: null) => searchHitsOf(store));

export const PLUGIN_DATA_POINTS_UNIT = storeUnit(
  (store, { pluginId, stream, limit }: PluginDataQuery): PluginDataPoint[] => {
    store.plugins.byId(pluginId);
    return stream === undefined
      ? store.pluginData.latest(pluginId)
      : store.pluginData.history(pluginId, stream, limit);
  },
);

export const PLUGIN_BUILTINS_SYNC_UNIT = storeUnit(
  (store, manifests: readonly PluginManifest[]) => {
    for (const manifest of manifests) {
      if (store.plugins.find(manifest.id) === undefined)
        store.plugins.create({ manifest, source: 'builtin', location: null, trusted: true });
      else store.plugins.update(manifest.id, { manifest });
    }
  },
);

export const PLUGIN_PEOPLE_LIST_UNIT = storeUnit((store, pluginId: string) =>
  listPluginPeople(store, pluginId),
);

export const PLUGIN_PERSON_SET_UNIT = storeUnit((store, input: PluginPersonSave) =>
  savePluginPerson(store, input),
);

export const PLUGIN_PERSON_REMOVE_UNIT = storeUnit(
  (store, input: { readonly pluginId: string; readonly externalId: string }) => {
    removePluginPerson(store, input);
  },
);
