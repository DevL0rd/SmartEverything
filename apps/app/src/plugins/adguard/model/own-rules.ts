import { BLOCKABLE_DOMAIN } from '@smarteverything/domain';

type RuleEffect = 'Blocks' | 'Always allows' | 'Blocks, pattern';

export interface RuleLine {
  readonly text: string;
  readonly effect: RuleEffect;
  readonly domain: string | null;
}

const DOMAIN_RULE = /^(?:@@)?\|\|([^\s*/^|]+)\^$/;
const COMMENT = /^(?:!|#(?![#@%?$]))/;
const PATTERN_RULE = /^\/.*\/$/;

function effectOf(rule: string): RuleEffect {
  if (rule.startsWith('@@')) {
    return 'Always allows';
  }
  return PATTERN_RULE.test(rule) ? 'Blocks, pattern' : 'Blocks';
}

function removableDomain(rule: string): string | null {
  const named = DOMAIN_RULE.exec(rule)?.[1];
  if (named === undefined) {
    return null;
  }
  const parsed = BLOCKABLE_DOMAIN.safeParse(named);
  return parsed.success ? parsed.data : null;
}

export function ruleLines(rules: readonly string[]): readonly RuleLine[] {
  return rules
    .map((rule) => rule.trim())
    .filter((rule) => rule !== '' && !COMMENT.test(rule))
    .map((text) => ({ text, effect: effectOf(text), domain: removableDomain(text) }));
}
