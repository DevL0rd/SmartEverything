import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import catalogue from '../../skills/catalogue.json' with { type: 'json' };
import { PRODUCT_SKILL_CATALOGUE } from './product-skill-schema';

export const PRODUCT_SKILLS = deepFreeze(PRODUCT_SKILL_CATALOGUE.parse(catalogue));
