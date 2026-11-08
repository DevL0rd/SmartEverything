import {
  graphRuleIssues,
  kindLookupFrom,
  type GraphRuleIssue,
  type ProgramV4,
} from '@smarteverything/domain';
import { check } from '../check/check';
import type { CheckContext, Problem } from '../check/check';
import { lower, type LowerContext } from '../compile/lower';
import type { LowerProblem } from '../compile/lower-effects';
import type { Plan } from '../compile/plan';
import type { Program } from '../program/walk';
import type { GraphProblem } from './problem-types';
import type { StructureMap } from './structure';
import { structuredOf } from './structured-of';

export interface LowerGraphContext {
  readonly check: CheckContext;
  readonly lower: LowerContext;
}

export type LowerGraphResult =
  | {
      readonly ok: true;
      readonly plan: Plan;
      readonly tree: Program;
      readonly map: StructureMap;
    }
  | { readonly ok: false; readonly stage: 'rules'; readonly problems: readonly GraphRuleIssue[] }
  | { readonly ok: false; readonly stage: 'structure'; readonly problems: readonly GraphProblem[] }
  | { readonly ok: false; readonly stage: 'check'; readonly problems: readonly Problem[] }
  | { readonly ok: false; readonly stage: 'lower'; readonly problems: readonly LowerProblem[] };

export function lowerGraph(program: ProgramV4, context: LowerGraphContext): LowerGraphResult {
  const kinds = kindLookupFrom(context.check.kinds);
  const rules = graphRuleIssues(program, kinds);
  if (rules.length > 0) return { ok: false, stage: 'rules', problems: rules };
  const structured = structuredOf(program, kinds);
  if (structured.kind === 'unstructured') {
    return { ok: false, stage: 'structure', problems: structured.problems };
  }
  const checked = check(structured.tree, context.check);
  if (checked.length > 0) return { ok: false, stage: 'check', problems: checked };
  const lowered = lower(structured.tree, context.lower);
  if (!lowered.ok) return { ok: false, stage: 'lower', problems: lowered.problems };
  return { ok: true, plan: lowered.plan, tree: structured.tree, map: structured.map };
}
