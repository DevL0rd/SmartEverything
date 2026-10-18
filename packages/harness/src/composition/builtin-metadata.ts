import { createHash } from 'node:crypto';
import { HARNESS_PLUGIN_METADATA } from '@smarteverything/domain';
import type { HarnessPluginMetadata } from '@smarteverything/domain';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';

export const HARNESS_DSH_VERSION = '0.2.1-alpha.2';
export const HARNESS_NATIVE_RUNTIME_REVISION = 'dsh-alpha.2-selected-machine-native-v2';

export function builtinMetadata(identity: {
  readonly id: string;
  readonly version: string;
  readonly kind: 'skills' | 'tools';
  readonly platforms: HarnessPluginMetadata['platforms'];
  readonly serverSafe: boolean;
}): HarnessPluginMetadata {
  const release = `${identity.id}@${identity.version}+dsh-${HARNESS_DSH_VERSION}`;
  return deepFreeze(
    HARNESS_PLUGIN_METADATA.parse({
      source: { kind: 'builtin', identity: `smarteverything-${identity.id}` },
      integrity: `sha256-${createHash('sha256').update(release).digest('base64')}`,
      provenance: release,
      platforms: identity.platforms,
      dsh_version: HARNESS_DSH_VERSION,
      runtime_version: HARNESS_NATIVE_RUNTIME_REVISION,
      server_safe: identity.serverSafe,
      adapter: { id: identity.id, version: identity.version, kind: identity.kind },
      skill_assets: [],
    }),
  );
}
