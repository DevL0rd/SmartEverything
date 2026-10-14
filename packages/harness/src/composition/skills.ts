import type { Context } from '@deepseek-ai/cordis';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import type * as Skills from '@deepseek-ai/dsh-skill';
import type * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import { NativeWorkspaceSkills } from './skill-filesystem';
import { registerProductSkills } from './product-skills';
import { verifyNativeSkillPackages } from './builtin-metadata';
import { z } from 'zod';
import type { HarnessHost } from '../host/contracts';
import type { InstalledHarnessSkillAsset } from './skill-assets';

const loadSkills = createLazyRequire<typeof Skills>('@deepseek-ai/dsh-skill', import.meta.url);
const loadSkillTool = createLazyRequire<typeof SkillTool>(
  '@deepseek-ai/dsh-tool-skill',
  import.meta.url,
);

const SKILLS_CONFIG = z.strictObject({
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
    await scope.plugin(skills.default);
    await scope.inject(['skills', 'fs'], (active: Context): void => {
      registerProductSkills(active);
      active.skills.registerProvider(
        (control) =>
          new NativeWorkspaceSkills(active, host, control, {
            assets,
            codingProcessAssets: config.coding_process_assets,
          }),
      );
    });
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
