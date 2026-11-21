import type { PluginPerson } from '@smarteverything/domain';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';

export class PluginPeopleNotLoadedError extends Error {
  override readonly name = 'PluginPeopleNotLoadedError';

  constructor(readonly pluginId: string) {
    super(
      `The people of plugin ${pluginId} were read before they were loaded from the store host.`,
    );
  }
}

function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function compared(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function ordered(a: PluginPerson, b: PluginPerson): number {
  return (
    compared(b.status, a.status) ||
    compared(asciiLower(a.name), asciiLower(b.name)) ||
    compared(a.external_id, b.external_id)
  );
}

export class PluginPeopleState {
  private readonly people = new Map<string, Map<string, PluginPerson>>();
  private readonly loading = new Map<string, Promise<void>>();

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
  ) {
    feed.subscribe((change) => {
      if (change.table === 'plugins' && change.record === null && change.oldRecord !== null) {
        this.people.delete(change.oldRecord.id);
        this.loading.delete(change.oldRecord.id);
      }
      if (change.table === 'profiles' && change.record === null && change.oldRecord !== null)
        this.profileRemoved(change.oldRecord.id);
    });
  }

  load(pluginId: string): Promise<void> {
    const pending = this.loading.get(pluginId);
    if (pending !== undefined) return pending;
    const loaded = this.fill(pluginId);
    this.loading.set(pluginId, loaded);
    return loaded;
  }

  current(pluginId: string): PluginPerson[] {
    return [...this.held(pluginId).values()].sort(ordered);
  }

  find(pluginId: string, externalId: string): PluginPerson | undefined {
    return this.held(pluginId).get(externalId);
  }

  saved(person: PluginPerson): void {
    this.after(person.plugin_id, (held) => {
      held.set(person.external_id, person);
    });
  }

  removed(pluginId: string, externalId: string): void {
    this.after(pluginId, (held) => {
      held.delete(externalId);
    });
  }

  private after(pluginId: string, apply: (held: Map<string, PluginPerson>) => void): void {
    const held = this.people.get(pluginId);
    if (held !== undefined) {
      apply(held);
      return;
    }
    const pending = this.loading.get(pluginId);
    if (pending === undefined) return;
    pending.then(
      () => {
        const loaded = this.people.get(pluginId);
        if (loaded !== undefined) apply(loaded);
      },
      () => undefined,
    );
  }

  private held(pluginId: string): Map<string, PluginPerson> {
    const held = this.people.get(pluginId);
    if (held === undefined) throw new PluginPeopleNotLoadedError(pluginId);
    return held;
  }

  private async fill(pluginId: string): Promise<void> {
    try {
      const rows = await this.host.read('pluginPeopleList', pluginId);
      this.people.set(pluginId, new Map(rows.map((person) => [person.external_id, person])));
    } catch (cause) {
      this.loading.delete(pluginId);
      throw cause;
    }
  }

  private profileRemoved(profileId: string): void {
    for (const held of this.people.values())
      for (const [externalId, person] of held)
        if (person.profile_id === profileId) held.set(externalId, { ...person, profile_id: null });
  }
}
