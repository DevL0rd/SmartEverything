import type { Context } from '@deepseek-ai/cordis';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill';
import type * as Skills from '@deepseek-ai/dsh-skill';
import type * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
} from '@deepseek-ai/dsh-skill';
import { PRODUCT_SKILLS } from './product-skill-catalogue';

const loadSkills = createLazyRequire<typeof Skills>('@deepseek-ai/dsh-skill', import.meta.url);
const loadSkillTool = createLazyRequire<typeof SkillTool>(
  '@deepseek-ai/dsh-tool-skill',
  import.meta.url,
);
const RESOURCE_BASE = {
  kind: 'opaque',
  description: 'Immutable built-in SmartEverything instructions.',
} as const;
function registerProductSkills(ctx: Context): void {
  ctx.skills.registerProvider(() => new ProductSkills());
}

export async function mountSkillCatalogue(
  ctx: Context,
  catalogDescriptionMaxLength: number,
): Promise<void> {
  await ctx.plugin(loadSkills().default);
  await ctx.inject(['skills'], (active: Context): void => {
    registerProductSkills(active);
  });
  await ctx.plugin(loadSkillTool(), { catalogDescriptionMaxLength });
}

class ProductSkills implements SkillProvider {
  readonly name = 'smarteverything-product';

  list(options: SkillLookupOptions): Promise<readonly SkillCandidate[]> {
    options.signal?.throwIfAborted();
    return Promise.resolve(
      PRODUCT_SKILLS.skills.map(({ content: _content, ...skill }) => ({
        ...skill,
        provider: this.name,
        source: 'bundled',
        rank: BUNDLED_SKILL_RANK,
        locator: skill.name,
        resourceBase: RESOURCE_BASE,
      })),
    );
  }

  get(
    candidate: SkillCandidate,
    options: SkillLookupOptions,
  ): Promise<SkillDefinition | undefined> {
    options.signal?.throwIfAborted();
    const skill = PRODUCT_SKILLS.skills.find((entry) => entry.name === candidate.locator);
    return Promise.resolve(
      skill === undefined
        ? undefined
        : {
            ...skill,
            provider: this.name,
            source: 'bundled',
            resourceBase: RESOURCE_BASE,
          },
    );
  }
}
