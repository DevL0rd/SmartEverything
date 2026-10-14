import { Context } from '@deepseek-ai/cordis';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import type * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSkillAsset } from '@smarteverything/domain';
import { HarnessSkillAssets } from './skill-assets';
import { skillSourceChunks } from './github-skill-source';
import { verifyNativeSkillPackages } from './builtin-metadata';
import { HarnessRuntimeError } from '../host/errors';

const loadSkillFilesystem = createLazyRequire<typeof SkillFilesystem>(
  '@deepseek-ai/dsh-skill-filesystem',
  import.meta.url,
);

export async function inspectHarnessSkillBundle(
  asset: HarnessSkillAsset,
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<{ readonly name: string; readonly description: string }> {
  await verifyNativeSkillPackages();
  const temporary = await mkdtemp(join(tmpdir(), 'smarteverything-skill-inspect-'));
  const context = new Context();
  const { FileSystemSkillProvider } = loadSkillFilesystem();
  let provider: SkillFilesystem.FileSystemSkillProvider | undefined;
  try {
    const cache = new HarnessSkillAssets(join(temporary, 'assets'), {
      read: (): Promise<AsyncIterable<Uint8Array>> => Promise.resolve(skillSourceChunks(bytes)),
    });
    const acquired = await cache.acquire(asset, signal);
    provider = new FileSystemSkillProvider(
      context,
      { signal, invalidate: (): void => undefined },
      {
        providerName: 'shared-skill-inspection',
        includeDefaultRoots: false,
        customSkillDirs: [acquired.directory],
        watch: false,
      },
    );
    const observed = await provider.list({ signal });
    const candidates = 'candidates' in observed ? observed.candidates : observed;
    const candidate = candidates.find((entry) => entry.path === acquired.entrypoint);
    if (candidate === undefined || (await provider.get(candidate, { signal })) === undefined)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'SKILL.md must contain a valid native skill name, description and invocation policy.',
      );
    return { name: candidate.name, description: candidate.description };
  } finally {
    if (provider !== undefined) await provider.dispose();
    await rm(temporary, { recursive: true, force: true });
  }
}
