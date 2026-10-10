import type { SecretStore } from '../secrets/store';

export class PluginSecrets {
  constructor(private readonly store: SecretStore) {}

  get(pluginId: string, name: string): string | null {
    return this.store.read().plugins[pluginId]?.[name] ?? null;
  }

  names(pluginId: string): string[] {
    return Object.keys(this.store.read().plugins[pluginId] ?? {}).sort();
  }

  async set(pluginId: string, values: Readonly<Record<string, string>>): Promise<void> {
    await this.store.update((secrets) => ({
      ...secrets,
      plugins: { ...secrets.plugins, [pluginId]: { ...secrets.plugins[pluginId], ...values } },
    }));
  }

  async remove(pluginId: string, name: string): Promise<void> {
    await this.store.update((secrets) => {
      const rest = Object.fromEntries(
        Object.entries(secrets.plugins[pluginId] ?? {}).filter(([key]) => key !== name),
      );
      return { ...secrets, plugins: { ...secrets.plugins, [pluginId]: rest } };
    });
  }

  async forget(pluginId: string): Promise<void> {
    await this.store.update((secrets) => ({
      ...secrets,
      plugins: Object.fromEntries(
        Object.entries(secrets.plugins).filter(([key]) => key !== pluginId),
      ),
    }));
  }
}
