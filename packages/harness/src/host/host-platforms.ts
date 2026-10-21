import {
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
} from '@smarteverything/domain';
import type { HarnessPlatform, HarnessSandboxEnforcement } from '@smarteverything/domain';
import type { SubscriptionStorage } from '../credentials/contracts';
import { LocalSubscriptionStorage } from '../credentials/local-storage';

export type ShellKind = 'bash' | 'pwsh';

export interface HostPlatformProfile {
  readonly shell: ShellKind;
  readonly subscriptionStorage: ((directory: string) => SubscriptionStorage) | null;
  readonly sandbox: HarnessSandboxEnforcement | null;
}

function ownerOnlyFiles(directory: string): SubscriptionStorage {
  return new LocalSubscriptionStorage(directory);
}

export const HOST_PLATFORM: Readonly<Record<HarnessPlatform, HostPlatformProfile>> = {
  linux: { shell: 'bash', subscriptionStorage: ownerOnlyFiles, sandbox: null },
  macos: { shell: 'bash', subscriptionStorage: ownerOnlyFiles, sandbox: null },
  windows: { shell: 'pwsh', subscriptionStorage: null, sandbox: 'partial' },
};

export function hostCapabilities(platform: HarnessPlatform): readonly string[] {
  return [
    HARNESS_CONFIGURATION_CAPABILITY,
    ...(HOST_PLATFORM[platform].subscriptionStorage === null
      ? []
      : [HARNESS_SUBSCRIPTION_CAPABILITY]),
  ];
}
