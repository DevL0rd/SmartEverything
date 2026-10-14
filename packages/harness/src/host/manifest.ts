import type { Context } from '@deepseek-ai/cordis';
import type { AiHarnessManifest } from '@smarteverything/domain';
import { KNOWN_SESSION_EVENT_TYPES, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import type { HarnessConfiguration } from '../composition/configuration';
import type { HarnessHost } from './contracts';
import { HARNESS_RUNTIME_REVISION } from '../composition/builtin-metadata';

export function harnessManifest(
  ctx: Context,
  host: HarnessHost,
  configuration: HarnessConfiguration,
  identity: { readonly fingerprint: string; readonly restoreRevision: string },
): AiHarnessManifest {
  return {
    protocol: 1,
    references: { protocol: 1 },
    human_commands: true,
    configuration_prepare: true,
    delivery_correlation: true,
    history_import: true,
    revision: HARNESS_RUNTIME_REVISION,
    composition: {
      dsh_version: '0.2.1-alpha.2',
      runtime_version: process.version,
      session_format: SESSION_FORMAT_VERSION,
      preset: 'smarteverything',
      fingerprint: identity.fingerprint,
      restore_revision: identity.restoreRevision,
      event_vocabulary: [...KNOWN_SESSION_EVENT_TYPES],
    },
    features: manifestFeatures(host.target.kind === 'server', configuration),
    tools: ctx.tools.schemas().map((tool) => tool.name),
    permissions: manifestPermissions(),
    permission_change: true,
  };
}

function manifestFeatures(
  server: boolean,
  configuration: HarnessConfiguration,
): AiHarnessManifest['features'] {
  const conversation: AiHarnessManifest['features'] = [
    'text',
    'reasoning',
    'images',
    'files',
    'interactions',
    'cancel',
    'compaction',
    'native-resume',
  ];
  if (server) return conversation;
  return [
    ...new Set<AiHarnessManifest['features'][number]>([
      ...conversation,
      'local-files',
      'shell',
      ...configuration.features(),
    ]),
  ];
}

function manifestPermissions(): AiHarnessManifest['permissions'] {
  return [
    { sandbox: 'danger-full-access', approval: 'never' },
    { sandbox: 'workspace-write', approval: 'on-request' },
    { sandbox: 'read-only', approval: 'on-request' },
  ];
}
