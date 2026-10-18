import type { JsonValue } from '@smarteverything/domain';
import type { PluginRecords } from '../../src/plugins/builtin/contract';

export function memoryRecords(initial: Readonly<Record<string, JsonValue>> = {}): PluginRecords {
  const store = new Map<string, JsonValue>(Object.entries(initial));
  return {
    get: (key) => store.get(key) ?? null,
    list: () => [...store].map(([key, value]) => ({ key, value })),
    put: (key, value): void => {
      store.set(key, value);
    },
    remove: (key): void => {
      store.delete(key);
    },
  };
}
