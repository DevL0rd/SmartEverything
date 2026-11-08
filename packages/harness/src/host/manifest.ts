import type { Context } from '@deepseek-ai/cordis';
import {
  AI_HARNESS_PERMISSIONS,
  AI_HARNESS_PROTOCOL_VERSION,
  type AiHarnessManifest,
} from '@smarteverything/domain';
import type { HarnessConfiguration } from '../composition/configuration';
import { HARNESS_NATIVE_RUNTIME_REVISION } from '../composition/builtin-metadata';

export function harnessManifest(
  ctx: Context,
  configuration: HarnessConfiguration,
  attachmentTransfer: boolean,
): AiHarnessManifest {
  return {
    protocol: AI_HARNESS_PROTOCOL_VERSION,
    references: { protocol: 1 },
    human_commands: true,
    delivery_correlation: true,
    revision: HARNESS_NATIVE_RUNTIME_REVISION,
    features: manifestFeatures(
      configuration,
      ctx.get('subagents') !== undefined,
      attachmentTransfer,
    ),
    tools: ctx.tools.schemas().map((tool) => tool.name),
    permissions: [...AI_HARNESS_PERMISSIONS],
    permission_change: true,
  };
}

function manifestFeatures(
  configuration: HarnessConfiguration,
  subagents: boolean,
  attachmentTransfer: boolean,
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
    ...(subagents ? ['subagent-send' as const, 'subagent-resume' as const] : []),
    ...(subagents && attachmentTransfer ? ['subagent-attachments' as const] : []),
  ];
  return [
    ...new Set<AiHarnessManifest['features'][number]>([
      ...conversation,
      'local-files',
      'shell',
      ...configuration.features(),
    ]),
  ];
}
