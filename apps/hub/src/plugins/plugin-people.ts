import {
  ApiError,
  PLUGIN_PEOPLE_MAX,
  type PluginPerson,
  type PluginPersonChange,
  type PluginPersonStatus,
  type PluginRequester,
} from '@smarteverything/domain';
import { ownerProfileOf } from '../transcripts/owner';
import type { Store } from '../store/store';
import type { Unsubscribe } from './builtin/contract';
import { pluginIdentityOf } from './plugin-identity';

const OWNER_NEEDS_OWNER_PERSON = 'The owner of a plugin must be one of the home’s owner people.';

const OWNER_PERSON_IS_THE_OWNER =
  'An owner person of the home can only be the owner of a plugin; link a member person to an approved person.';

export class PluginPeople {
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(private readonly store: Store) {}

  list(pluginId: string): PluginPerson[] {
    this.store.plugins.byId(pluginId);
    return this.store.pluginPeople.list(pluginId);
  }

  find(pluginId: string, externalId: string): PluginPerson | undefined {
    return this.store.pluginPeople.find(pluginId, externalId);
  }

  requesterOf(pluginId: string, externalId: string): PluginRequester {
    return pluginIdentityOf(this.store, pluginId, externalId).requester;
  }

  set(pluginId: string, externalId: string, change: PluginPersonChange): PluginPerson {
    const plugin = this.store.plugins.byId(pluginId);
    const people = this.store.pluginPeople.list(pluginId);
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
    const saved = this.store.pluginPeople.save(pluginId, externalId, {
      name: change.name,
      status: change.status,
      profile_id: this.mappedProfile(change, known),
    });
    this.changed(pluginId);
    return saved;
  }

  private mappedProfile(
    change: PluginPersonChange,
    known: PluginPerson | undefined,
  ): string | null {
    const profileId =
      change.profile_id === undefined ? this.keptProfile(change.status, known) : change.profile_id;
    if (profileId === null && change.status === 'owner') {
      throw new ApiError('invalid_request', OWNER_NEEDS_OWNER_PERSON);
    }
    if (profileId !== null) {
      this.assertMayBe(profileId, change.status);
    }
    return profileId;
  }

  private keptProfile(status: PluginPersonStatus, known: PluginPerson | undefined): string | null {
    const kept = known?.status === status ? known.profile_id : null;
    return kept ?? (status === 'owner' ? ownerProfileOf(this.store) : null);
  }

  private assertMayBe(profileId: string, status: PluginPersonStatus): void {
    const standing = this.store.personAccess.standing(profileId);
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

  remove(pluginId: string, externalId: string): void {
    this.store.plugins.byId(pluginId);
    if (!this.store.pluginPeople.remove(pluginId, externalId)) {
      throw new ApiError('not_found', `That person is not approved in this plugin.`);
    }
    this.changed(pluginId);
  }

  watch(pluginId: string, listener: () => void): Unsubscribe {
    const set = this.listeners.get(pluginId) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(pluginId, set);
    return (): void => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(pluginId);
      }
    };
  }

  private changed(pluginId: string): void {
    this.listeners.get(pluginId)?.forEach((listener) => {
      listener();
    });
  }
}
