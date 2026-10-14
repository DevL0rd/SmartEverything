import type { SkillDefinition } from '@deepseek-ai/dsh-skill';
import { PRODUCT_SKILLS } from './product-skill-catalogue';
import { HarnessRuntimeError } from '../host/errors';

export function withCodingProcess(definition: SkillDefinition): SkillDefinition {
  const process = PRODUCT_SKILLS.skills.find(
    (skill) => skill.name === 'smarteverything-coding-process',
  );
  if (process === undefined)
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'The managed coding process skill is unavailable.',
    );
  return {
    ...definition,
    content: `${definition.content}\n\n# SmartEverything managed process appendix\n\nThis appendix is maintained by SmartEverything; the upstream skill files are unchanged.\n\n${process.content}`,
  };
}
