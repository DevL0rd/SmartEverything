import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import { checkEntry, checkProgramValues } from './port-check';
import type { Problem } from './problems';
import { problem, siteName, visibilityFix } from './problems';
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

function visibilityProblem(found: VisibilityProblem): Problem {
  const { owner, reference, reason } = found;
  const code = reason === 'unknown_key' ? 'unknown_reference' : 'invisible_reference';
  return problem({ nodeId: owner.id, key: owner.key }, code, found.message, {
    port: siteName(reference.site),
    received: `${reference.from}.${reference.port}`,
    fix: visibilityFix(reason),
  });
}

export function check(program: Program, context: CheckContext): readonly Problem[] {
  const index = indexProgram(program);
  const { typed, problems: typing } = resolveTypes(index, context);
  const visibility = checkVisibility(index, visibilityKinds(context));
  return [
    ...visibility.problems.map(visibilityProblem),
    ...entriesOf(index).flatMap((entry) => checkEntry(entry, program, typed, context)),
    ...checkProgramValues(program, typed, context),
    ...typing,
  ];
}
