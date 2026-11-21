import { describe, expect, it, vi } from 'vitest';
import type { PluginManifest } from '@smarteverything/domain';
import { createKindCatalog } from '../../../src/automations/plugin-kinds/catalog';
import {
  followPluginKinds,
  type LoadedPlugins,
} from '../../../src/automations/plugin-kinds/contributions';
import { ONLINE_VALUE, POST_NODE, manifestWith } from './fixtures';

interface Host {
  readonly source: LoadedPlugins;
  readonly rows: Map<string, PluginManifest>;
  readonly running: Set<string>;
  readonly fire: () => void;
}

function hostOf(manifests: readonly PluginManifest[]): Host {
  const rows = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const running = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    rows,
    running,
    fire: (): void => {
      for (const listener of listeners) listener();
    },
    source: {
      plugins: () => Promise.resolve([...rows].map(([id, manifest]) => ({ id, manifest }))),
      loaded: (id) => running.has(id),
      changes: (listener) => {
        listeners.add(listener);
        return (): void => {
          listeners.delete(listener);
        };
      },
    },
  };
}

const POST_ID = 'plugin.chat_hub.post_message';

function written(): ReturnType<typeof vi.fn<(pluginId: string, detail: string) => Promise<void>>> {
  return vi.fn((_pluginId: string, _detail: string) => Promise.resolve());
}

function failed(cause: unknown): void {
  throw cause;
}

describe('followPluginKinds', () => {
  it('adds kinds when a plugin loads and removes them when it unloads', async () => {
    const catalog = createKindCatalog();
    const host = hostOf([manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })]);
    host.running.add('chat-hub');
    const follow = await followPluginKinds(catalog, host.source, written(), failed);
    expect(catalog.has(POST_ID)).toBe(true);
    host.running.delete('chat-hub');
    host.fire();
    await follow.settled();
    expect(catalog.has(POST_ID)).toBe(false);
    host.running.add('chat-hub');
    host.fire();
    await follow.settled();
    expect(catalog.has(POST_ID)).toBe(true);
    follow.stop();
    expect(catalog.has(POST_ID)).toBe(false);
  });

  it('ignores plugins that are installed but not loaded', async () => {
    const catalog = createKindCatalog();
    const host = hostOf([manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })]);
    await followPluginKinds(catalog, host.source, written(), failed);
    expect(catalog.has(POST_ID)).toBe(false);
  });

  it('resyncs when the loaded manifest changes', async () => {
    const catalog = createKindCatalog();
    const host = hostOf([manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })]);
    host.running.add('chat-hub');
    const follow = await followPluginKinds(catalog, host.source, written(), failed);
    host.rows.set(
      'chat-hub',
      manifestWith('chat-hub', { values: [ONLINE_VALUE], autoTriggers: false }),
    );
    host.fire();
    await follow.settled();
    expect(catalog.has(POST_ID)).toBe(false);
    expect(catalog.has('plugin.chat_hub.members_online')).toBe(true);
  });

  it('writes rejected kinds into the plugin status detail while the good ones load', async () => {
    const catalog = createKindCatalog();
    const bad = {
      ...POST_NODE,
      id: 'broken',
      inputs: [{ ...POST_NODE.inputs[0], required: true, default: 'x' }, POST_NODE.inputs[1]],
    };
    const host = hostOf([
      manifestWith('chat-hub', { nodes: [POST_NODE, bad], autoTriggers: false }),
    ]);
    host.running.add('chat-hub');
    const write = written();
    await followPluginKinds(catalog, host.source, write, failed);
    expect(catalog.has(POST_ID)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      'chat-hub',
      expect.stringContaining('plugin.chat_hub.broken'),
    );
  });
});
