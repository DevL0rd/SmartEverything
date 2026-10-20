import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import { check } from './check';
import type { Problem } from './problems';
import { resolveTypes } from './types';
import { adviceRules } from './lint-advice';
import { contractRules } from './lint-contract';
import { effectRules } from './lint-effects';
import { flowRules } from './lint-flow';
import { loopRules } from './lint-loops';
import type { Finding, FindingSeverity, LintContext, LintInput, LintRule } from './lint-types';
import { fixText } from './lint-types';

export {
  FINDING,
  FINDING_CODES,
  LINT_ACTION,
  LINT_ERROR_CODES,
  LINT_FIX,
  LINT_HINT_CODES,
  LINT_WARNING_CODES,
  type Finding,
  type FindingCode,
  type FindingSeverity,
  type LintAction,
  type LintContext,
  type LintFix,
  type LintKind,
} from './lint-types';

const RULES: readonly LintRule[] = [
  ...contractRules,
  ...flowRules,
  ...loopRules,
  ...effectRules,
  ...adviceRules,
];

const RANK: Readonly<Record<FindingSeverity, number>> = { error: 0, warning: 1, hint: 2 };

function fromProblem(found: Problem): Finding {
  const { fix, ...rest } = found;
  return { severity: 'error', ...rest, ...(fix === undefined ? {} : { fix: fixText(fix) }) };
}

export function lint(program: Program, ctx: LintContext): readonly Finding[] {
  const index = indexProgram(program);
  const { typed } = resolveTypes(index, ctx);
  const input: LintInput = { program, index, ctx, typed };
  return [...check(program, ctx).map(fromProblem), ...RULES.flatMap((rule) => rule(input))].sort(
    (left, right) => RANK[left.severity] - RANK[right.severity],
  );
}

export function hasErrors(findings: readonly Finding[]): boolean {
  return findings.some((found) => found.severity === 'error');
}
