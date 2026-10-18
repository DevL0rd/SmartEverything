type DomainRuleKind = 'block' | 'allow';

export type DomainRuleChange = DomainRuleKind | 'remove';

function blockRule(domain: string): string {
  return `||${domain}^`;
}

function allowRule(domain: string): string {
  return `@@||${domain}^`;
}

export function withDomainRule(
  rules: readonly string[],
  domain: string,
  change: DomainRuleChange,
): string[] {
  const own = new Set([blockRule(domain), allowRule(domain)]);
  const kept = rules.filter((rule) => !own.has(rule.trim()));
  if (change === 'remove') {
    return kept;
  }
  return [...kept, change === 'block' ? blockRule(domain) : allowRule(domain)];
}

export function ruleKindFor(rules: readonly string[], domain: string): DomainRuleKind | null {
  const trimmed = new Set(rules.map((rule) => rule.trim()));
  if (trimmed.has(blockRule(domain))) {
    return 'block';
  }
  return trimmed.has(allowRule(domain)) ? 'allow' : null;
}
