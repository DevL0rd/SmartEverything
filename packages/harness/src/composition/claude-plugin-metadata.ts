import { createHash } from 'node:crypto';
import { HARNESS_PLUGIN_METADATA } from '@smarteverything/domain';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { HARNESS_RUNTIME_REVISION } from './builtin-metadata';

export const HARNESS_CLAUDE_PLUGINS_PACKAGE = '@smarteverything/harness-claude-plugins';
export const HARNESS_CLAUDE_PLUGINS_VERSION = '0.1.0-smarteverything.1';
const SOURCE = {
  loader: 'lengdanran/dsh-claude-plugin-loader@2e7b593e715e1f945f27b4c1c9ef1b8ab0f4f8e2',
  hooks: '@deepseek-ai/dsh-hooks-claude-code@0.2.1-alpha.2',
  subagent: '@deepseek-ai/dsh-subagent,dsh-tool-subagent@0.2.1-alpha.2',
  adapter: HARNESS_CLAUDE_PLUGINS_VERSION,
} as const;
export const HARNESS_CLAUDE_PLUGINS_METADATA = deepFreeze(
  HARNESS_PLUGIN_METADATA.parse({
    source: { kind: 'builtin', identity: 'smarteverything-plugin-loader-v1' },
    integrity: `sha256-${createHash('sha256').update(JSON.stringify(SOURCE)).digest('base64')}`,
    provenance: SOURCE.loader,
    platforms: ['linux', 'macos', 'windows'],
    dsh_version: '0.2.1-alpha.2',
    runtime_version: HARNESS_RUNTIME_REVISION,
    server_safe: true,
    adapter: { id: 'claude-plugins', version: HARNESS_CLAUDE_PLUGINS_VERSION, kind: 'tools' },
    skill_assets: [],
  }),
);
