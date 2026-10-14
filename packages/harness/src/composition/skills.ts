import type { Context } from '@deepseek-ai/cordis';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import type * as Skills from '@deepseek-ai/dsh-skill';
import type * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import { NativeWorkspaceSkills } from './skill-filesystem';
import { registerManagedPluginSurfaces } from './managed-plugin-registry';
import { registerProductSkills } from './product-skills';
import { verifyNativeSkillPackages } from './builtin-metadata';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { HarnessHost } from '../host/contracts';
import type { InstalledHarnessSkillAsset } from './skill-assets';
import { githubSkillIdentity } from './github-skill-bundle';

const loadSkills = createLazyRequire<typeof Skills>('@deepseek-ai/dsh-skill', import.meta.url);
const loadSkillTool = createLazyRequire<typeof SkillTool>(
  '@deepseek-ai/dsh-tool-skill',
  import.meta.url,
);

const SKILLS_CONFIG = z.strictObject({
  claude_skills_enabled: z.boolean().default(true),
  coding_process_assets: z
    .array(z.string().regex(/^github-skill:[a-f0-9]{64}$/u))
    .max(32)
    .default([]),
  catalog_description_max_length: z.number().int().min(3).max(2_000).default(500),
});

export async function mountNativeSkills(
  ctx: Context,
  host: HarnessHost,
  raw: unknown,
  assets: readonly InstalledHarnessSkillAsset[] = [],
): Promise<{ readonly dispose: () => Promise<void> }> {
  const config = SKILLS_CONFIG.parse(raw);
  await verifyNativeSkillPackages();
  for (const asset of assets) await asset.verify();
  const skills = loadSkills();
  const tool = loadSkillTool();
  const fiber = ctx.plugin(async (scope: Context): Promise<void> => {
    const names = new Set<string>();
    scope.effect(() => registerManagedPluginSurfaces(ctx, [], names));
    if (host.target.kind !== 'server') await scope.plugin(skills.default);
    await scope.inject(['skills', 'fs'], (active: Context): void => {
      if (host.target.kind !== 'server') registerProductSkills(active);
      active.skills.registerProvider(
        (control) =>
          new NativeWorkspaceSkills(active, host, control, {
            assets: config.claude_skills_enabled
              ? assets
              : assets.filter((asset) => !officialClaudeSkill(asset)),
            codingProcessAssets: config.coding_process_assets,
            visibleNames: names,
          }),
      );
    });
    if (host.target.kind !== 'server')
      await scope.plugin(tool, {
        catalogDescriptionMaxLength: config.catalog_description_max_length,
      });
  });
  try {
    await fiber;
    return { dispose: fiber.dispose };
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
}

function officialClaudeSkill(installed: InstalledHarnessSkillAsset): boolean {
  const asset = installed.asset;
  if (
    asset.source.kind !== 'artifact' ||
    new URL(asset.source.url).hostname !== 'raw.githubusercontent.com'
  )
    return false;
  const identity = githubSkillIdentity(asset.source.url);
  return (
    identity.owner === 'anthropics' &&
    identity.repository === 'skills' &&
    /^skills\/[a-z0-9-]+\/SKILL\.md$/u.test(identity.path) &&
    asset.version === identity.commit &&
    asset.id ===
      `github-skill:${createHash('sha256').update(`anthropics/skills/${identity.path}`).digest('hex')}`
  );
}
