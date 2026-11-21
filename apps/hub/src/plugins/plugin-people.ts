import type { PluginPerson, PluginPersonChange, PluginRequester } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Unsubscribe } from './builtin/contract';
import { pluginIdentityOf } from './plugin-identity';

export class PluginPeople {
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(private readonly store: Store) {}

  list(pluginId: string): Promise<PluginPerson[]> {
    return this.store.host.read('pluginPeopleList', pluginId);
  }

  load(pluginId: string): Promise<void> {
    return this.store.live.pluginPeople.load(pluginId);
  }

  current(pluginId: string): PluginPerson[] {
    return this.store.live.pluginPeople.current(pluginId);
  }

  find(pluginId: string, externalId: string): PluginPerson | undefined {
    return this.store.live.pluginPeople.find(pluginId, externalId);
  }

  async requesterOf(pluginId: string, externalId: string): Promise<PluginRequester> {
    return (await pluginIdentityOf(this.store, pluginId, externalId)).requester;
  }

  async set(
    pluginId: string,
    externalId: string,
    change: PluginPersonChange,
  ): Promise<PluginPerson> {
    const saved = await this.store.host.write('pluginPersonSet', { pluginId, externalId, change });
    this.store.live.pluginPeople.saved(saved);
    this.changed(pluginId);
    return saved;
  }

  async remove(pluginId: string, externalId: string): Promise<void> {
    await this.store.host.write('pluginPersonRemove', { pluginId, externalId });
    this.store.live.pluginPeople.removed(pluginId, externalId);
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
