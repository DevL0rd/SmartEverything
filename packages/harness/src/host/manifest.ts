import type { Context } from '@deepseek-ai/cordis';
import { AI_HARNESS_PERMISSIONS } from '@smarteverything/domain';
import type { AiHarnessManifest } from '@smarteverything/domain';
import type { HarnessConfiguration } from '../composition/configuration';
import { HARNESS_NATIVE_RUNTIME_REVISION } from '../composition/builtin-metadata';

export function harnessManifest(
  ctx: Context,
  configuration: HarnessConfiguration,
): AiHarnessManifest {
  return {
    protocol: 1,
    references: { protocol: 1 },
    human_commands: true,
    delivery_correlation: true,
    revision: HARNESS_NATIVE_RUNTIME_REVISION,
    features: manifestFeatures(configuration),
    tools: ctx.tools.schemas().map((tool) => tool.name),
    permissions: [...AI_HARNESS_PERMISSIONS],
    permission_change: true,
  };
}

function manifestFeatures(configuration: HarnessConfiguration): AiHarnessManifest['features'] {
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
  return [
    ...new Set<AiHarnessManifest['features'][number]>([
      ...conversation,
      'local-files',
      'shell',
      ...configuration.features(),
    ]),
  ];
}
