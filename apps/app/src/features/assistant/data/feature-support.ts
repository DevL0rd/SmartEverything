import {
  harnessTargetKey,
  type AiHarnessHost,
  type AiHarnessTarget,
} from '@smarteverything/domain';
import { useHarnessCatalogue } from './harness';

const RUNTIME_FEATURES = {
  agents: ({ manifest }: AiHarnessHost): boolean =>
    manifest?.features.includes('remote-subagents') === true,
  helperAttachments: ({ manifest, online }: AiHarnessHost): boolean =>
    online &&
    manifest !== null &&
    manifest.features.includes('subagent-send') &&
    manifest.features.includes('subagent-attachments'),
} as const;

export type RuntimeFeature = keyof typeof RUNTIME_FEATURES;

export function runtimeFeatureSupported(
  feature: RuntimeFeature,
  host: AiHarnessHost | undefined,
): boolean {
  return host !== undefined && RUNTIME_FEATURES[feature](host);
}

export function useFeatureSupport(
  feature: RuntimeFeature,
  target: AiHarnessTarget | null,
): boolean {
  const catalogue = useHarnessCatalogue();
  if (target === null) return false;
  const key = harnessTargetKey(target);
  return runtimeFeatureSupported(
    feature,
    catalogue.data?.hosts.find((host) => harnessTargetKey(host.target) === key),
  );
}
