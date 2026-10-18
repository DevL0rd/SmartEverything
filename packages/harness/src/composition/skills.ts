import type { Context } from '@deepseek-ai/cordis';
import { NativeWorkspaceSkills } from './skill-filesystem';
import { mountSkillCatalogue } from './product-skills';
import { z } from 'zod';
import type { HarnessHost } from '../host/contracts';
import type { InstalledHarnessSkillAsset } from './skill-assets';

export const SKILLS_CONFIG = z.strictObject({
  claude_skills_enabled: z.boolean().default(true),
  catalog_description_max_length: z.number().int().min(3).default(500),
});

export async function mountNativeSkills(
  ctx: Context,
  host: HarnessHost,
  raw: unknown,
  assets: readonly InstalledHarnessSkillAsset[] = [],
): Promise<{ readonly dispose: () => Promise<void> }> {
  const config = SKILLS_CONFIG.parse(raw);
  const fiber = ctx.plugin(async (scope: Context): Promise<void> => {
    if (host.target.kind !== 'server')
      await mountSkillCatalogue(scope, config.catalog_description_max_length);
    await scope.inject(['skills', 'fs'], (active: Context): void => {
      active.skills.registerProvider(
        (control) =>
          new NativeWorkspaceSkills(
            active,
            host,
            control,
            config.claude_skills_enabled ? assets : [],
          ),
      );
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
