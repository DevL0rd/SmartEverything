import {
  harnessTargetKey,
  type AiHarnessHost,
  type AiHarnessTarget,
} from '@smarteverything/domain';
import { useHarnessCatalogue } from './harness';

type Manifest = NonNullable<AiHarnessHost['manifest']>;

const RUNTIME_FEATURES = {
  agents: (manifest: Manifest): boolean => manifest.features.includes('remote-subagents'),
} as const;

export type RuntimeFeature = keyof typeof RUNTIME_FEATURES;

export function runtimeFeatureSupported(
  feature: RuntimeFeature,
  host: AiHarnessHost | undefined,
): boolean {
  const manifest = host?.manifest;
  return manifest !== undefined && manifest !== null && RUNTIME_FEATURES[feature](manifest);
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
