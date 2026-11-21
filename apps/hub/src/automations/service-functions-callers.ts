import {
  ApiError,
  AUTOMATION_V4,
  FUNCTION_V4,
  type AutomationFunctionCallersReply,
  type AutomationFunctionMapping,
  type AutomationFunctionUser,
  type AutomationProgramProblem,
  type FunctionRevisionRow,
  type JsonValue,
  type Layout,
  type NodeKind,
  type ProgramV4,
} from '@smarteverything/domain';
import { applyUpdateMapping } from '@smarteverything/flow/functions/mapping';
import { interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import { type Caller } from '../server/auth';
import { storeUnit } from '../store/host/unit';
import { structuredProgram } from '../store/repositories/automation-trees';
import type { HostStore } from '../store/host/host-store';
import type { SpeechPrincipal } from '../transcripts/speech-principal';
import type { ProgramData } from './program-data';
import { unitKinds, type UnitKinds } from './program-kinds';
import { applySpeech, priorSpeech, type SpeechPlan } from './program-speech';
import {
  analyse,
  analysisEnv,
  failure,
  planValue,
  type AnalysisEnv,
} from './service-programs-analysis';
import { authorOf, reached, type Reached } from './service-reach';
import { authorise, classify, hashOf, requireEditable, usersOf } from './service-functions-support';

interface StoredCaller {
  readonly id: string;
  readonly layout: Layout;
  readonly revision: number;
}

interface Mapped {
  readonly user: AutomationFunctionUser;
  readonly program: ProgramV4;
  readonly calls: readonly string[];
  readonly automation: StoredCaller | null;
  readonly function: FunctionRevisionRow | null;
}

export interface CallerTarget extends Mapped {
  readonly plan: JsonValue;
  readonly prior: SpeechPrincipal | null;
}

export type PreparedCallers =
  | { readonly kind: 'done'; readonly reply: AutomationFunctionCallersReply }
  | { readonly kind: 'ready'; readonly targets: readonly CallerTarget[] };

export interface PrepareCallersInput {
  readonly data: ProgramData;
  readonly caller: Caller;
  readonly authority: ConversationAuthority | undefined;
  readonly id: string;
  readonly mapping: AutomationFunctionMapping;
}

export interface CommitCallersInput {
  readonly kinds: readonly NodeKind[];
  readonly caller: Caller;
  readonly authority: ConversationAuthority | undefined;
  readonly targets: readonly (CallerTarget & { readonly speech: SpeechPlan | null })[];
}

export type UpdatedCaller = AutomationFunctionCallersReply['updated'][number];

function problemsOf(
  user: AutomationFunctionUser,
  found: readonly AutomationProgramProblem[],
): AutomationProgramProblem[] {
  return found
    .filter((problem) => problem.severity === 'error')
    .map((problem) => ({ ...problem, message: `${user.name}: ${problem.message}` }));
}

function storedOf(
  env: AnalysisEnv,
  user: AutomationFunctionUser,
): Pick<Mapped, 'automation' | 'function'> & { readonly program: ProgramV4 } {
  const functions = env.store.automationFunctions;
  if (user.kind === 'automation') {
    const row = env.store.automations.byId(user.id);
    const automation = { id: row.id, layout: row.layout, revision: row.revision };
    return { program: row.definition, automation, function: null };
  }
  const callee = functions.latest(user.id);
  return { program: callee.definition, automation: null, function: callee };
}

function mappedTarget(
  env: AnalysisEnv,
  id: string,
  mapping: AutomationFunctionMapping,
  user: AutomationFunctionUser,
): { target?: Mapped; problems: AutomationProgramProblem[] } {
  const stored = storedOf(env, user);
  const next = interfaceOf(env.store.automationFunctions.latest(id).definition);
  const result = applyUpdateMapping(
    structuredProgram(stored.program, env.kinds),
    id,
    next,
    mapping,
  );
  const problems = result.issues.map((issue) =>
    failure('mapping_incomplete', `${user.name}: ${issue.message}`),
  );
  if (result.touched.length === 0) return { problems };
  return {
    problems,
    target: {
      ...stored,
      user,
      program: unstructure(result.program, env.kinds),
      calls: result.touched,
    },
  };
}

function built(
  env: AnalysisEnv,
  caller: Caller,
  target: Mapped,
): { target?: CallerTarget; problems: AutomationProgramProblem[] } {
  const analysis = analyse(env, target.program);
  if (analysis.built === undefined) return { problems: problemsOf(target.user, analysis.problems) };
  authorise(env, caller, target.program, analysis.built);
  const prior = target.automation === null ? null : priorSpeech(env.store, target.automation.id);
  return { target: { ...target, plan: planValue(analysis.built.plan), prior }, problems: [] };
}

function failed(summary: string, problems: readonly AutomationProgramProblem[]): PreparedCallers {
  return { kind: 'done', reply: { ok: false, summary, updated: [], problems: [...problems] } };
}

function prepare(env: AnalysisEnv, input: PrepareCallersInput): PreparedCallers {
  const { caller, id, mapping } = input;
  const functions = env.store.automationFunctions;
  requireEditable(caller, functions.byId(id));
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
    if (target.function !== null)
      requireEditable(caller, functions.byId(target.function.function_id));
  }
  return { kind: 'ready', targets };
}

function saveAutomation(
  store: HostStore,
  kinds: UnitKinds,
  input: CommitCallersInput,
  target: CommitCallersInput['targets'][number] & { readonly automation: StoredCaller },
): number {
  const { automation } = target;
  const saved = store.automations.replace(
    automation.id,
    {
      program: AUTOMATION_V4.parse(target.program),
      layout: automation.layout,
      expectedRevision: automation.revision,
      planHash: store.automationPlans.put('automation', target.plan),
      author: authorOf(input.caller),
    },
    kinds,
  );
  store.harnessRecovery.effects.keep('automation', saved.id, input.authority);
  if (target.speech === null) throw new ApiError('internal', 'The caller has no speech plan.');
  applySpeech(store, saved, target.speech);
  return saved.revision;
}

function saveFunction(
  store: HostStore,
  kinds: UnitKinds,
  caller: Caller,
  target: CallerTarget,
): number {
  const before = target.function;
  if (before === null) throw new ApiError('internal', 'The caller has no stored revision.');
  const next = FUNCTION_V4.parse(target.program);
  return store.automationFunctions.revise(
    before.function_id,
    {
      program: next,
      layout: before.layout,
      interfaceHash: hashOf(next),
      compat: classify(before.definition, next).result,
      planHash: store.automationPlans.put('function', target.plan),
      author: authorOf(caller),
      expectedRevision: before.revision,
    },
    kinds,
  ).latest_revision;
}

function commit(store: HostStore, input: CommitCallersInput): UpdatedCaller[] {
  const kinds = unitKinds(store, input.kinds);
  return input.targets.map((target) => {
    const { automation } = target;
    const revision =
      automation === null
        ? saveFunction(store, kinds, input.caller, target)
        : saveAutomation(store, kinds, input, { ...target, automation });
    return { ...target.user, revision, calls: [...target.calls] };
  });
}

export const PREPARE_FUNCTION_CALLERS_UNIT = storeUnit(
  (store, input: PrepareCallersInput): Reached<PreparedCallers> =>
    withExecutionAuthority(input.authority, () =>
      reached(() => prepare(analysisEnv(store, input.data, null), input)),
    ),
);

export const COMMIT_FUNCTION_CALLERS_UNIT = storeUnit(commit);
