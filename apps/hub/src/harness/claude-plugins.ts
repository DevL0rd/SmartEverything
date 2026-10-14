import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  OFFICIAL_CLAUDE_PLUGINS,
  officialClaudePluginId,
  type OfficialClaudePlugin,
} from '@smarteverything/harness';
import { ApiError, type HarnessDiscoveryItem } from '@smarteverything/domain';
import { readDiscoveryJson, readDiscoverySource } from './discovery-http';

const REF = z.object({ object: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u) }) });
const MANIFEST = z.object({ name: z.string(), description: z.string().min(1).max(2000) });
const CACHE_MS = 60 * 60 * 1000;
const MAX_SNAPSHOTS = 4;
export const CLAUDE_PLUGINS_SOURCE = {
  id: 'official-claude-plugins',
  label: 'Official plugins and independent community extensions',
  url: 'https://github.com/anthropics/claude-plugins-official',
} as const;
export interface ClaudePluginSnapshot {
  readonly commit: string;
  readonly fetched_at: string;
  readonly items: readonly HarnessDiscoveryItem[];
}
export class ClaudePlugins {
  private current: ClaudePluginSnapshot | undefined;
  private pending: Promise<ClaudePluginSnapshot> | undefined;
  private readonly snapshots = new Map<string, ClaudePluginSnapshot>();

  snapshot(refresh: boolean, commit?: string): Promise<ClaudePluginSnapshot> {
    if (commit !== undefined) return Promise.resolve(this.retainedSnapshot(commit));
    if (this.pending !== undefined) return this.pending;
    if (
      !refresh &&
      this.current !== undefined &&
      Date.now() - Date.parse(this.current.fetched_at) < CACHE_MS
    )
      return Promise.resolve(this.current);
    this.pending = this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  retainedSnapshot(commit: string): ClaudePluginSnapshot {
    const snapshot = this.snapshots.get(commit);
    if (snapshot === undefined)
      throw new ApiError('conflict', 'Plugin catalogue snapshot expired. Restart at page one.');
    return snapshot;
  }

  private async load(): Promise<ClaudePluginSnapshot> {
    const ref = REF.parse(
      await readDiscoveryJson(
        'https://api.github.com/repos/anthropics/claude-plugins-official/git/ref/heads/main',
        256 * 1024,
        CLAUDE_PLUGINS_SOURCE.label,
      ),
    );
    const known = this.snapshots.get(ref.object.sha);
    const items =
      known === undefined
        ? await Promise.all(
            OFFICIAL_CLAUDE_PLUGINS.map((plugin) => pluginItem(ref.object.sha, plugin)),
          )
        : known.items;
    const snapshot = { commit: ref.object.sha, fetched_at: new Date().toISOString(), items };
    this.snapshots.delete(snapshot.commit);
    this.snapshots.set(snapshot.commit, snapshot);
    while (this.snapshots.size > MAX_SNAPSHOTS) {
      const oldest = this.snapshots.keys().next().value;
      if (oldest !== undefined) this.snapshots.delete(oldest);
    }
    this.current = snapshot;
    return snapshot;
  }
}

async function pluginItem(
  commit: string,
  plugin: OfficialClaudePlugin,
): Promise<HarnessDiscoveryItem> {
  const url = rawClaudePluginUrl(commit, plugin.name);
  const manifest = MANIFEST.parse(
    await readDiscoveryJson(url, 256 * 1024, CLAUDE_PLUGINS_SOURCE.label),
  );
  const license = await readDiscoverySource(
    url.replace('.claude-plugin/plugin.json', 'LICENSE'),
    64 * 1024,
    CLAUDE_PLUGINS_SOURCE.label,
  );
  if (
    license === null ||
    createHash('sha256').update(license).digest('hex') !== plugin.license_sha256
  )
    throw new ApiError('conflict', 'Official plugin license is not approved.');
  if (manifest.name !== plugin.name)
    throw new ApiError('conflict', 'Official plugin identity changed.');
  return {
    id: officialClaudePluginId(plugin),
    kind: 'extension',
    name: plugin.name,
    description: manifest.description,
    publisher: 'Anthropic',
    license: 'Apache-2.0',
    source_url: `https://github.com/anthropics/claude-plugins-official/tree/${commit}/plugins/${plugin.name}`,
    installed_id: null,
    acquisition: { state: 'available', url },
  };
}

export function rawClaudePluginUrl(commit: string, name: string): string {
  return `https://raw.githubusercontent.com/anthropics/claude-plugins-official/${commit}/plugins/${name}/.claude-plugin/plugin.json`;
}
