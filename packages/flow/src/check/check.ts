import { execPortsOf, kindLookupFrom } from '@smarteverything/domain';
import type { FlowNode } from '@smarteverything/domain';
import { findByKey, indexProgram } from '../program/lookup';
import type { ProgramIndex } from '../program/lookup';
import type { Program } from '../program/walk';
import { checkEntry, checkProgramValues } from './port-check';
import type { Problem } from './problems';
import { problem, scopeFix, siteName, visibilityFix } from './problems';
import type { CheckContext } from './shapes';
import { entriesOf } from './shapes';
import { resolveTypes } from './types';
import type { VisibilityKinds, VisibilityProblem } from './visibility-types';
import { checkVisibility } from './visibility';

export type {
  AutomationInterface,
  CheckContext,
  CheckKind,
  NodeShape,
  OutputMap,
  PortTypes,
  TypedProgram,
} from './shapes';
export { PROBLEM, PROBLEM_CODES, type Problem, type ProblemCode } from './problems';
export { resolveTypes, type TypeReport } from './types';

function visibilityKinds(ctx: CheckContext): VisibilityKinds {
  return {
    classOf: (kind) => ctx.kinds(kind)?.class,
    outputsOf: (kind) => ctx.kinds(kind)?.outputs ?? [],
  };
}

function ownerOf(
  index: ProgramIndex,
  context: CheckContext,
  from: string,
): { node: FlowNode; lane: string } | undefined {
  const source = findByKey(index, from);
  if (source?.kind !== 'node' || source.scope.t === 'root') return undefined;
  const { key, part } = source.scope;
  const owner = findByKey(index, key);
  if (owner?.kind !== 'node') return undefined;
  const lane =
    part.kind === 'scope'
      ? execPortsOf(owner.node.kind, owner.node, kindLookupFrom(context.kinds)).outputs.find(
          (out) => out.port === part.name,
        )?.label
      : undefined;
  return { node: owner.node, lane: lane ?? '' };
}

function scopeFixOf(index: ProgramIndex, context: CheckContext, from: string): string {
  const found = ownerOf(index, context, from);
  if (found === undefined) return scopeFix(undefined, undefined);
  const { node, lane } = found;
  const name = node.label ?? context.kinds(node.kind)?.name ?? node.key;
  return scopeFix(name, lane === '' ? undefined : lane);
}

function visibilityProblem(
  index: ProgramIndex,
  context: CheckContext,
  found: VisibilityProblem,
): Problem {
  const { owner, reference, reason } = found;
  const code = reason === 'unknown_key' ? 'unknown_reference' : 'invisible_reference';
  return problem({ nodeId: owner.id, key: owner.key }, code, found.message, {
    port: siteName(reference.site),
    received: `${reference.from}.${reference.port}`,
    fix:
      reason === 'not_in_scope'
        ? scopeFixOf(index, context, reference.from)
        : visibilityFix(reason),
  });
}

export function check(program: Program, context: CheckContext): readonly Problem[] {
  const index = indexProgram(program);
  const { typed, problems: typing } = resolveTypes(index, context);
  const visibility = checkVisibility(index, visibilityKinds(context));
  return [
    ...visibility.problems.map((found) => visibilityProblem(index, context, found)),
    ...entriesOf(index).flatMap((entry) => checkEntry(entry, program, typed, context)),
    ...checkProgramValues(program, typed, context),
    ...typing,
  ];
}
