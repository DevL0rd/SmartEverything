import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RuleTester, type Rule } from 'eslint';
import { describe, it } from 'vitest';
import { z } from 'zod';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const RULES = z.object({
  default: z.object({ rules: z.record(z.string(), z.custom<Rule.RuleModule>()) }),
});

export async function localRule(name: string): Promise<Rule.RuleModule> {
  const loaded = RULES.parse(
    await import(pathToFileURL(join(import.meta.dirname, '..', 'eslint', 'rules.js')).href),
  );
  const rule = loaded.default.rules[name];
  if (rule === undefined) {
    throw new Error(`The local lint plugin has no rule named ${name}`);
  }
  return rule;
}

export { RuleTester };
