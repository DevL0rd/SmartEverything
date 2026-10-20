import {
  ApiError,
  AUTOMATION_V3,
  FUNCTION_V3,
  type AutomationFunctionCallersReply,
  type AutomationFunctionMapping,
  type AutomationFunctionUser,
  type AutomationProgramProblem,
  type AutomationRowV3,
  type FunctionRevisionRow,
} from '@smarteverything/domain';
import { applyUpdateMapping } from '@smarteverything/flow/functions/mapping';
import { interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import type { Program } from '@smarteverything/flow/program/walk';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import { type Caller } from '../server/auth';
import { analyse, failure, planValue, type Built } from './service-programs-analysis';
import { authorSpeech } from './service-programs-speech';
import { authorOf } from './service-reach';
import {
  authorise,
  classify,
  hashOf,
  requireEditable,
  usersOf,
  type FunctionsEnv,
} from './service-functions-support';

interface Target {
  readonly user: AutomationFunctionUser;
  readonly program: Program;
  readonly built: Built;
  readonly calls: readonly string[];
  readonly automation: AutomationRowV3 | undefined;
  readonly function: FunctionRevisionRow | undefined;
}

function problemsOf(
  user: AutomationFunctionUser,
  found: readonly AutomationProgramProblem[],
): AutomationProgramProblem[] {
  return found
    .filter((problem) => problem.severity === 'error')
    .map((problem) => ({ ...problem, message: `${user.name}: ${problem.message}` }));
}

function mappedTarget(
  env: FunctionsEnv,
  id: string,
  mapping: AutomationFunctionMapping,
  user: AutomationFunctionUser,
): { target?: Omit<Target, 'built'>; problems: AutomationProgramProblem[] } {
  const row = user.kind === 'automation' ? env.programs.byId(user.id) : undefined;
  const callee = user.kind === 'function' ? env.functions.latest(user.id) : undefined;
  const program = row?.definition ?? callee?.definition;
  if (program === undefined) return { problems: [] };
  const next = interfaceOf(env.functions.latest(id).definition);
  const result = applyUpdateMapping(program, id, next, mapping);
  const problems = result.issues.map((issue) =>
    failure('mapping_incomplete', `${user.name}: ${issue.message}`),
  );
  if (result.touched.length === 0) return { problems };
  return {
    problems,
    target: {
      user,
      program: result.program,
      calls: result.touched,
      automation: row,
      function: callee,
    },
  };
}

function built(
  env: FunctionsEnv,
  caller: Caller,
  target: Omit<Target, 'built'>,
): { target?: Target; problems: AutomationProgramProblem[] } {
  const analysis =
    target.function === undefined
      ? analyse(env, target.program)
      : analyse(env, FUNCTION_V3.parse(target.program));
  if (analysis.built === undefined) return { problems: problemsOf(target.user, analysis.problems) };
  authorise(env, caller, target.program, analysis.built);
  return { target: { ...target, built: analysis.built }, problems: [] };
}

function saveTarget(env: FunctionsEnv, caller: Caller, target: Target): number {
  const author = authorOf(env.store, caller);
  const planHash = env.plans.put(
    target.function === undefined ? 'automation' : 'function',
    planValue(target.built.plan),
  );
  if (target.automation !== undefined) {
    const saved = env.programs.replace(target.automation.id, {
      program: AUTOMATION_V3.parse(target.program),
      layout: target.automation.layout,
      expectedRevision: target.automation.revision,
      planHash,
      author,
    });
    env.store.harnessRecovery.effects.keep('automation', saved.id, currentExecutionAuthority());
    authorSpeech(env.store, caller, saved);
    return saved.revision;
  }
  const before = target.function;
  if (before === undefined) throw new ApiError('internal', 'The caller has no stored revision.');
  const next = FUNCTION_V3.parse(target.program);
  return env.functions.revise(before.function_id, {
    program: next,
    layout: before.layout,
    interfaceHash: hashOf(next),
    compat: classify(before.definition, next).result,
    planHash,
    author,
    expectedRevision: before.revision,
  }).latest_revision;
}

function failed(
  summary: string,
  problems: readonly AutomationProgramProblem[],
): AutomationFunctionCallersReply {
  return { ok: false, summary, updated: [], problems: [...problems] };
}

export function updateCallers(
  env: FunctionsEnv,
  caller: Caller,
  id: string,
  mapping: AutomationFunctionMapping,
): AutomationFunctionCallersReply {
  requireEditable(env, caller, env.functions.byId(id));
  const mapped = usersOf(env, id).map((user) => mappedTarget(env, id, mapping, user));
  const mappingProblems = mapped.flatMap((entry) => entry.problems);
  if (mappingProblems.length > 0) {
    return failed('The mapping is not complete. Nothing was saved.', mappingProblems);
  }
  const checked = mapped.flatMap((entry) =>
    entry.target === undefined ? [] : [built(env, caller, entry.target)],
  );
  const problems = checked.flatMap((entry) => entry.problems);
  if (problems.length > 0)
    return failed('A caller would not pass the check. Nothing was saved.', problems);
  const targets = checked.flatMap((entry) => (entry.target === undefined ? [] : [entry.target]));
  for (const target of targets) {
    if (target.function !== undefined) {
      requireEditable(env, caller, env.functions.byId(target.function.function_id));
    }
  }
  const updated = env.store.write(() =>
    targets.map((target) => ({
      ...target.user,
      revision: saveTarget(env, caller, target),
      calls: [...target.calls],
    })),
  );
  return {
    ok: true,
    summary: `Updated ${String(updated.length)} caller(s).`,
    updated,
    problems: [],
  };
}
