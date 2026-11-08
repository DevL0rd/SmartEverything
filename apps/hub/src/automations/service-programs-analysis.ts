import {
  FLOW_SCOPE_OUTPUTS,
  JSON_VALUE,
  type AutomationProgramProblem,
  type AutomationProgramReply,
  type JsonValue,
  type NodeKind,
  type NodeKindLookup,
  type RefKind,
} from '@smarteverything/domain';
import { z } from 'zod';
import { canonicalPlan } from '@smarteverything/flow/compile/hash';
import { lower, type LowerResult } from '@smarteverything/flow/compile/lower';
import type { LowerProblem } from '@smarteverything/flow/compile/lower-effects';
import {
  manifestOf,
  type Manifest,
  type ResolvePlan,
} from '@smarteverything/flow/compile/manifest';
import { PLAN, type Plan } from '@smarteverything/flow/compile/plan';
import { hasErrors, lint, type Finding, type LintContext } from '@smarteverything/flow/check/lint';
import {
  interfaceOf,
  type FunctionInterface,
} from '@smarteverything/flow/functions/interface-hash';
import {
  applyPatch,
  type PatchOptions,
  type PatchProblem,
  type PatchResult,
} from '@smarteverything/flow/graph/ops/reducer';
import { PATCH_OPS, type PatchOp } from '@smarteverything/flow/graph/ops/schema';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import type { Program } from '@smarteverything/flow/program/walk';
import type { FunctionRevisionRow, ProgramV4 } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import type { KindCatalog } from './plugin-kinds/catalog';
import type { AutomationFunctionsRepository } from '../store/repositories/automation-functions';
import type { AutomationPlansRepository } from '../store/repositories/automation-plans';
import type { AutomationProgramsRepository } from '../store/repositories/automation-programs';
import type { AutomationRevisionsRepository } from '../store/repositories/automation-revisions';
import type { Store } from '../store/store';
import type { ToolHub } from '../ai-tools/tool-hub';
import { invalid } from '../server/errors';
import type { AutomationSecrets } from './secrets-v3';

export interface AnalysisEnv {
  readonly store: Store;
  readonly programs: Pick<AutomationProgramsRepository, 'find'>;
  readonly functions: Pick<AutomationFunctionsRepository, 'find' | 'latest' | 'findRevision'>;
  readonly plans: Pick<AutomationPlansRepository, 'find'>;
  readonly secrets: Pick<AutomationSecrets, 'list'>;
  readonly kinds: NodeKindLookup & Pick<KindCatalog, 'availability'>;
}

export interface ProgramEnv extends AnalysisEnv {
  readonly programs: AutomationProgramsRepository;
  readonly revisions: AutomationRevisionsRepository;
  readonly plans: AutomationPlansRepository;
  readonly tools: Pick<ToolHub, 'pluginTurnRefusal'>;
}

export interface Basis {
  readonly id: string;
  readonly revision: number;
}

export interface Built {
  readonly plan: Plan;
  readonly manifest: Manifest;
}

export interface Analysis {
  readonly problems: readonly AutomationProgramProblem[];
  readonly built: Built | undefined;
}

export function kindResolver(
  env: Pick<AnalysisEnv, 'kinds'>,
): (id: string) => NodeKind | undefined {
  return (id) => env.kinds.get(id);
}

const ACTION = z.record(z.string(), JSON_VALUE);

const REFUSAL_SHOWN = 5;

function present(work: () => unknown): boolean {
  try {
    work();
    return true;
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return false;
    throw cause;
  }
}

type Lookup = (env: AnalysisEnv, id: string) => boolean;

const REFERENCES: Readonly<Record<RefKind, Lookup>> = {
  device: ({ store }, id) => store.devices.find(id) !== undefined,
  camera: ({ store }, id) => store.devices.find(id) !== undefined,
  phone: ({ store }, id) => store.devices.find(id)?.kind === 'phone',
  computer: ({ store }, id) => store.devices.find(id)?.kind === 'computer',
  room: ({ store }, id) => present(() => store.rooms.byId(id)),
  group: ({ store }, id) => present(() => store.deviceGroups.byId(id)),
  scene: ({ store }, id) => present(() => store.scenes.byId(id)),
  person: ({ store }, id) => present(() => store.profiles.byId(id)),
  chat: ({ store }, id) => store.aiChats.find(id) !== undefined,
  value: ({ store }, id) => present(() => store.automationValues.byId(id)),
  automation: ({ programs }, id) => programs.find(id) !== undefined,
  function: ({ functions }, id) => functions.find(id) !== undefined,
  secret: ({ secrets }, id) => secrets.list().some((secret) => secret.id === id),
  target: (env, id) =>
    REFERENCES.device(env, id) || REFERENCES.room(env, id) || REFERENCES.group(env, id),
};

export function revisionOf(
  env: AnalysisEnv,
  id: string,
  pin: number | undefined,
): FunctionRevisionRow | undefined {
  if (pin !== undefined) return env.functions.findRevision(id, pin);
  return env.functions.find(id) === undefined ? undefined : env.functions.latest(id);
}

function interfaceOfCallee(
  env: AnalysisEnv,
  id: string,
  pin: number | undefined,
): FunctionInterface | undefined {
  const row = revisionOf(env, id, pin);
  return row === undefined ? undefined : interfaceOf(row.definition);
}

function lintKinds(env: Pick<AnalysisEnv, 'kinds'>): LintContext['kinds'] {
  return (id) => {
    const kind = env.kinds.get(id);
    const availability = env.kinds.availability(id);
    if (kind === undefined || availability === undefined) return kind;
    return { ...kind, availability };
  };
}

export function lintContextOf(env: AnalysisEnv): LintContext {
  return {
    kinds: lintKinds(env),
    automations: (id) => env.programs.find(id)?.definition,
    scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
    references: (kind, id) => REFERENCES[kind](env, id),
    functions: (id, pin) => interfaceOfCallee(env, id, pin),
    secrets: new Set(env.secrets.list().map((secret) => secret.id)),
  };
}

function resolvePlanOf(env: AnalysisEnv): ResolvePlan {
  return (callee) => {
    const row = revisionOf(env, callee.fn, callee.pin);
    const stored = row === undefined ? undefined : env.plans.find(row.plan_hash);
    return stored === undefined ? undefined : PLAN.parse(JSON.parse(stored.json));
  };
}

function problemOf(finding: Finding): AutomationProgramProblem {
  const { fix, ...rest } = finding;
  if (fix === undefined) return rest;
  const action = fix.action === undefined ? {} : { action: ACTION.parse(fix.action) };
  return { ...rest, fix: { summary: fix.summary, ...action } };
}

function lowerProblemOf(found: LowerProblem): AutomationProgramProblem {
  const { fix, ...rest } = found;
  return { severity: 'error', ...rest, ...(fix === undefined ? {} : { fix: { summary: fix } }) };
}

export function failure(code: string, message: string): AutomationProgramProblem {
  return { severity: 'error', code, message };
}

function hasErrorProblems(problems: readonly AutomationProgramProblem[]): boolean {
  return problems.some((found) => found.severity === 'error');
}

function graphProblemOf(found: GraphProblem): AutomationProgramProblem {
  return {
    severity: 'error',
    code: found.code,
    ...(found.nodeId === undefined ? {} : { nodeId: found.nodeId }),
    ...(found.key === undefined ? {} : { key: found.key }),
    ...(found.port === undefined ? {} : { port: found.port }),
    message: found.message,
    fix: { summary: found.fix },
  };
}

function lowered(env: AnalysisEnv, program: Program, problems: readonly Finding[]): Analysis {
  const kinds = kindResolver(env);
  const result: LowerResult = lower(program, { kinds });
  const shown = problems.map(problemOf);
  if (!result.ok)
    return { problems: [...shown, ...result.problems.map(lowerProblemOf)], built: undefined };
  const manifest = manifestOf(result.plan, kinds, resolvePlanOf(env));
  return { problems: shown, built: { plan: result.plan, manifest } };
}

export function analyse(env: AnalysisEnv, program: ProgramV4): Analysis {
  const structured = structuredOf(program, env.kinds);
  if (structured.kind === 'unstructured') {
    return { problems: structured.problems.map(graphProblemOf), built: undefined };
  }
  const findings = lint(structured.tree, lintContextOf(env));
  return hasErrors(findings)
    ? { problems: findings.map(problemOf), built: undefined }
    : lowered(env, structured.tree, findings);
}

export function lintProblems(
  env: AnalysisEnv,
  program: ProgramV4,
): readonly AutomationProgramProblem[] {
  const structured = structuredOf(program, env.kinds);
  if (structured.kind === 'unstructured') return structured.problems.map(graphProblemOf);
  return lint(structured.tree, lintContextOf(env)).map(problemOf);
}

export function planValue(plan: Plan): JsonValue {
  return JSON_VALUE.parse(JSON.parse(canonicalPlan(plan)));
}

function parseOps(ops: readonly unknown[]): readonly PatchOp[] {
  const parsed = PATCH_OPS.safeParse(ops);
  if (!parsed.success) throw invalid('patch operations', parsed.error);
  return parsed.data;
}

function patchProblemOf(found: PatchProblem): AutomationProgramProblem {
  return {
    severity: 'error',
    code: found.code,
    ...(found.key === undefined ? {} : { key: found.key }),
    ...(found.port === undefined ? {} : { port: found.port }),
    message: found.message,
    ...(found.fix === undefined ? {} : { fix: { summary: found.fix } }),
  };
}

export function refusedPatch(
  result: Extract<PatchResult, { ok: false }>,
): readonly AutomationProgramProblem[] {
  if (result.problems.length > 0) return result.problems.map(patchProblemOf);
  const where = result.opIndex === undefined ? '' : ` (operation ${String(result.opIndex + 1)})`;
  return [failure(result.code, `${result.reason}${where}`)];
}

export function refusalText(problems: readonly AutomationProgramProblem[]): string {
  return problems
    .slice(0, REFUSAL_SHOWN)
    .map((found) => found.message)
    .join('; ');
}

export function patched(
  program: ProgramV4,
  ops: readonly unknown[],
  options: PatchOptions,
): PatchResult {
  return applyPatch(program, parseOps(ops), options);
}

export function reply(
  ok: boolean,
  summary: string,
  basis: Basis | null,
  problems: readonly AutomationProgramProblem[],
): AutomationProgramReply {
  return {
    ok,
    summary,
    id: basis?.id ?? null,
    revision: basis?.revision ?? null,
    problems: [...problems],
  };
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

export function tally(problems: readonly AutomationProgramProblem[]): string {
  const errors = problems.filter((found) => found.severity === 'error').length;
  const warnings = problems.filter((found) => found.severity === 'warning').length;
  if (errors + warnings === 0) return 'no problems';
  return [plural(errors, 'error'), plural(warnings, 'warning')].join(' and ');
}

export function checked(
  basis: Basis | null,
  problems: readonly AutomationProgramProblem[],
): AutomationProgramReply {
  const ok = !hasErrorProblems(problems);
  return reply(ok, `Checked: ${tally(problems)}. Nothing was saved.`, basis, problems);
}
