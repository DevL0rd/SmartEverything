import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { HarnessSkillAssetBundle } from './skill-asset-format';
import { encodeSkillBundle, githubFolderFiles } from './github-skill-bundle';
import type { GithubSkillSourceIdentity } from './github-skill-bundle';
import { readSkillSourceHttp } from './skill-source-http';
import { HarnessRuntimeError } from '../host/errors';
import {
  HARNESS_CLAUDE_PLUGINS_PACKAGE,
  HARNESS_CLAUDE_PLUGINS_VERSION,
} from './claude-plugin-metadata';

const MANIFEST_PATH = '/.claude-plugin/plugin.json';
const LICENSE_SHA256 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';
const COMMIT = z.object({ committer: z.object({ date: z.iso.datetime({ offset: true }) }) });
const MANIFEST = z.object({ name: z.string(), description: z.string().min(1).max(2000) });
export const OFFICIAL_CLAUDE_PLUGINS = [
  {
    name: 'code-simplifier',
    entrypoint: 'agents/code-simplifier.md',
    license_sha256: LICENSE_SHA256,
  },
  {
    name: 'frontend-design',
    entrypoint: 'skills/frontend-design/SKILL.md',
    license_sha256: LICENSE_SHA256,
  },
  { name: 'feature-dev', entrypoint: 'commands/feature-dev.md', license_sha256: LICENSE_SHA256 },
] as const;
export type OfficialClaudePlugin = (typeof OFFICIAL_CLAUDE_PLUGINS)[number];

export function officialClaudePlugin(
  identity: GithubSkillSourceIdentity,
): OfficialClaudePlugin | undefined {
  if (
    identity.owner !== 'anthropics' ||
    identity.repository !== 'claude-plugins-official' ||
    !identity.path.endsWith(MANIFEST_PATH)
  )
    return undefined;
  const plugin = OFFICIAL_CLAUDE_PLUGINS.find(
    (entry) => identity.path === `plugins/${entry.name}${MANIFEST_PATH}`,
  );
  if (plugin === undefined)
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'This plugin source is not approved.',
    );
  return plugin;
}

export function officialClaudePluginId(plugin: OfficialClaudePlugin): string {
  return `github-plugin:${createHash('sha256')
    .update(`anthropics/claude-plugins-official/plugins/${plugin.name}`)
    .digest('hex')}`;
}

export async function githubPluginBundle(
  identity: GithubSkillSourceIdentity,
  plugin: OfficialClaudePlugin,
  signal: AbortSignal,
): Promise<Buffer> {
  const prefix = `plugins/${plugin.name}/`;
  const files = await githubFolderFiles(identity, prefix, signal);
  const manifest = MANIFEST.parse(JSON.parse(pluginFile(files, '.claude-plugin/plugin.json')));
  if (manifest.name !== plugin.name)
    throw new HarnessRuntimeError('composition_incompatible', 'Plugin manifest identity changed.');
  const license = pluginFile(files, 'LICENSE');
  if (createHash('sha256').update(license).digest('hex') !== plugin.license_sha256)
    throw new HarnessRuntimeError('composition_incompatible', 'Plugin license is not approved.');
  if (!files.some((file) => file.path === plugin.entrypoint))
    throw new HarnessRuntimeError('composition_incompatible', 'Plugin entrypoint is absent.');
  const commit = COMMIT.parse(
    JSON.parse(
      (
        await readSkillSourceHttp(
          `https://api.github.com/repos/${identity.owner}/${identity.repository}/git/commits/${identity.commit}`,
          256 * 1024,
          signal,
        )
      ).toString('utf8'),
    ),
  );
  files.push(pluginProvenance(identity, plugin, files, commit.committer.date));
  return encodeSkillBundle(files);
}

export function pluginFile(files: HarnessSkillAssetBundle['files'], path: string): string {
  const file = files.find((entry) => entry.path === path);
  if (file === undefined)
    throw new HarnessRuntimeError('composition_incompatible', `Plugin file ${path} is absent.`);
  return new TextDecoder('utf8', { fatal: true }).decode(Buffer.from(file.base64, 'base64'));
}

function pluginProvenance(
  identity: GithubSkillSourceIdentity,
  plugin: OfficialClaudePlugin,
  files: HarnessSkillAssetBundle['files'],
  lastUpdated: string,
): HarnessSkillAssetBundle['files'][number] {
  const provenance = {
    repository: 'anthropics/claude-plugins-official',
    url: `https://github.com/anthropics/claude-plugins-official/tree/${identity.commit}/plugins/${plugin.name}`,
    path: `plugins/${plugin.name}`,
    commit: identity.commit,
    license: 'Apache-2.0',
    adapter: { package: HARNESS_CLAUDE_PLUGINS_PACKAGE, version: HARNESS_CLAUDE_PLUGINS_VERSION },
    lastUpdated,
    files: files.map((file) => ({
      path: file.path,
      sha256: createHash('sha256').update(Buffer.from(file.base64, 'base64')).digest('hex'),
    })),
    changes: [
      'Removed repository folder prefix; upstream file bytes are unchanged.',
      'Encoded files in the existing immutable HarnessSkillAsset bundle format.',
      'Added provenance.json outside model instructions.',
      'Native adapter mounts approved plugin components through guarded SmartEverything capabilities.',
    ],
  };
  return {
    path: 'provenance.json',
    base64: Buffer.from(JSON.stringify(provenance)).toString('base64'),
  };
}
