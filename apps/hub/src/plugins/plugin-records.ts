import type { JsonValue } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { PluginRecordEntry } from '../store/repositories/plugin-data';
import type { Store } from '../store/store';
import type { PluginRecords } from './builtin/contract';

export class PluginRecordMirror {
  private readonly collections = new Map<string, Map<string, JsonValue>>();

  private constructor(
    private readonly store: Pick<Store, 'host'>,
    private readonly pluginId: string,
    entries: readonly PluginRecordEntry[],
  ) {
    for (const entry of entries) this.held(entry.collection).set(entry.key, entry.value);
  }

  static async load(store: Pick<Store, 'host'>, pluginId: string): Promise<PluginRecordMirror> {
    return new PluginRecordMirror(
      store,
      pluginId,
      await store.host.call('pluginData', 'allRecords', pluginId),
    );
  }

  collection(name: string): PluginRecords {
    const held = this.held(name);
    return {
      get: (key): JsonValue | null => {
        const value = held.get(key);
        return value === undefined ? null : structuredClone(value);
      },
      list: () =>
        [...held.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, value]) => ({ key, value: structuredClone(value) })),
      put: (key, value): void => {
        held.set(key, structuredClone(value));
        this.saved(
          this.store.host.call('pluginData', 'putRecord', this.pluginId, name, key, value),
          name,
        );
      },
      remove: (key): void => {
        held.delete(key);
        this.saved(
          this.store.host.call('pluginData', 'removeRecord', this.pluginId, name, key),
          name,
        );
      },
    };
  }

  private held(name: string): Map<string, JsonValue> {
    let held = this.collections.get(name);
    if (held === undefined) {
      held = new Map();
      this.collections.set(name, held);
    }
    return held;
  }

  private saved(work: Promise<void>, collection: string): void {
    background(work, 'plugin.record_save_failed', { pluginId: this.pluginId, collection });
  }
}
