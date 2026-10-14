import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { HarnessPluginMetadata } from '@smarteverything/domain';
import { HARNESS_PLUGIN_METADATA } from '@smarteverything/domain';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { CODEGRAPH_PACKAGES } from './indexer-provenance-data';
import { CODEGRAPH_PROVENANCE, verifyPackageVersion } from './indexer-provenance';
import { HarnessRuntimeError } from '../host/errors';
import { BROWSER_PACKAGES } from './browser-provenance-data';

export const HARNESS_RUNTIME_REVISION = 'dsh-alpha.2-node-2-historical-paths-v1';
const requirePackage = createRequire(import.meta.url);
const SKILL_MEMBERS = ['LICENSE', 'lib/index.js', 'lib/types/index.d.ts', 'package.json'] as const;
const SKILL_PACKAGES = [
  {
    package: '@deepseek-ai/dsh-skill',
    sha256: 'c76e10f90a54aeaf199de0146640f754bbb32c9abd75bf536aeb3b018b754f61',
  },
  {
    package: '@deepseek-ai/dsh-skill-filesystem',
    sha256: '8ddf6875e3351791ca6e5b60c93440b2290d71a74bc609bdc6d72b27f01d2e35',
  },
  {
    package: '@deepseek-ai/dsh-tool-skill',
    sha256: 'ffcf9147e943062c5d54ebbcaa7a061865768b00e718584f246e78f8bc0f1596',
  },
] as const;

export const HARNESS_CODEGRAPH_METADATA = builtinMetadata(
  {
    id: 'codegraph',
    version: '0.1.6-smarteverything.2',
    provenance: CODEGRAPH_PROVENANCE,
    kind: 'tools',
  },
  CODEGRAPH_PACKAGES,
);
export const HARNESS_SKILLS_METADATA = builtinMetadata(
  {
    id: 'skills',
    version: '0.2.1-alpha.2',
    provenance:
      'npm:@deepseek-ai/dsh-skill,dsh-skill-filesystem,dsh-tool-skill@0.2.1-alpha.2+verified-members-v1',
    kind: 'skills',
  },
  SKILL_PACKAGES,
);
export const HARNESS_BROWSER_METADATA = builtinMetadata(
  {
    id: 'browser',
    version: '0.2.1-alpha.2',
    provenance:
      'npm:deepseek-ai/browser-use@0.2.1-alpha.2+playwright-mcp@0.0.80+verified-members-v1',
    kind: 'tools',
  },
  BROWSER_PACKAGES,
);

export async function verifyNativeSkillPackages(): Promise<void> {
  for (const expected of SKILL_PACKAGES) {
    await verifyPackageVersion(expected.package, '0.2.1-alpha.2');
    const root = dirname(requirePackage.resolve(`${expected.package}/package.json`));
    const hash = createHash('sha256');
    for (const member of SKILL_MEMBERS)
      hash
        .update(member)
        .update('\0')
        .update(await readFile(join(root, member)))
        .update('\0');
    if (hash.digest('hex') !== expected.sha256)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Installed ${expected.package} differs from the pinned native skill artifact.`,
      );
  }
}

function builtinMetadata(
  identity: {
    readonly id: string;
    readonly version: string;
    readonly provenance: string;
    readonly kind: 'skills' | 'tools';
  },
  members: readonly { readonly package: string; readonly sha256: string }[],
): HarnessPluginMetadata {
  return deepFreeze(
    HARNESS_PLUGIN_METADATA.parse({
      source: { kind: 'builtin', identity: `smarteverything-${identity.id}-members-v1` },
      integrity: `sha256-${createHash('sha256')
        .update(
          JSON.stringify(members.map(({ package: name, sha256 }) => ({ package: name, sha256 }))),
        )
        .digest('base64')}`,
      provenance: identity.provenance,
      platforms: ['linux'],
      dsh_version: '0.2.1-alpha.2',
      runtime_version: HARNESS_RUNTIME_REVISION,
      server_safe: false,
      adapter: { id: identity.id, version: identity.version, kind: identity.kind },
      skill_assets: [],
    }),
  );
}
