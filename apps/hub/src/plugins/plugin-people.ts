import {
  ApiError,
  PLUGIN_PEOPLE_MAX,
  type PluginPerson,
  type PluginPersonChange,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Unsubscribe } from './builtin/contract';

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

  set(pluginId: string, externalId: string, change: PluginPersonChange): PluginPerson {
    const plugin = this.store.plugins.byId(pluginId);
    const people = this.store.pluginPeople.list(pluginId);
    const known = people.some((person) => person.external_id === externalId);
    if (!known && people.length >= PLUGIN_PEOPLE_MAX) {
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
    const saved = this.store.pluginPeople.save(pluginId, externalId, change);
    this.changed(pluginId);
    return saved;
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
