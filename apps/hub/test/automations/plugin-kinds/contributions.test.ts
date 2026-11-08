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
      plugins: () => [...rows].map(([id, manifest]) => ({ id, manifest })),
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

describe('followPluginKinds', () => {
  it('adds kinds when a plugin loads and removes them when it unloads', () => {
    const catalog = createKindCatalog();
    const host = hostOf([manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })]);
    host.running.add('chat-hub');
    const stop = followPluginKinds(catalog, host.source, vi.fn());
    expect(catalog.has(POST_ID)).toBe(true);
    host.running.delete('chat-hub');
    host.fire();
    expect(catalog.has(POST_ID)).toBe(false);
    host.running.add('chat-hub');
    host.fire();
    expect(catalog.has(POST_ID)).toBe(true);
    stop();
    expect(catalog.has(POST_ID)).toBe(false);
  });

  it('ignores plugins that are installed but not loaded', () => {
    const catalog = createKindCatalog();
    const host = hostOf([manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })]);
    followPluginKinds(catalog, host.source, vi.fn());
    expect(catalog.has(POST_ID)).toBe(false);
  });

  it('resyncs when the loaded manifest changes', () => {
    const catalog = createKindCatalog();
    const host = hostOf([manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })]);
    host.running.add('chat-hub');
    followPluginKinds(catalog, host.source, vi.fn());
    host.rows.set(
      'chat-hub',
      manifestWith('chat-hub', { values: [ONLINE_VALUE], autoTriggers: false }),
    );
    host.fire();
    expect(catalog.has(POST_ID)).toBe(false);
    expect(catalog.has('plugin.chat_hub.members_online')).toBe(true);
  });

  it('writes rejected kinds into the plugin status detail while the good ones load', () => {
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
    const write = vi.fn();
    followPluginKinds(catalog, host.source, write);
    expect(catalog.has(POST_ID)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      'chat-hub',
      expect.stringContaining('plugin.chat_hub.broken'),
    );
  });
});
