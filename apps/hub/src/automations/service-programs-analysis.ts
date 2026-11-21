import {
  FLOW_SCOPE_OUTPUTS,
  JSON_VALUE,
  type AutomationProgramProblem,
  type AutomationProgramReply,
  type JsonValue,
  type NodeKind,
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
import type { FunctionRevisionRow, FunctionV4, ProgramV4 } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import type { HostStore } from '../store/host/host-store';
import { invalid } from '../server/invalid';
import type { ProgramData } from './program-data';
import { unitKinds, type UnitKinds } from './program-kinds';

export interface PendingCallee {
  readonly id: string;
  readonly definition: FunctionV4;
  readonly plan: Plan;
}

export interface AnalysisEnv {
  readonly store: HostStore;
  readonly secrets: ReadonlySet<string>;
  readonly kinds: UnitKinds;
  readonly pending: PendingCallee | null;
}

export function analysisEnv(
  store: HostStore,
  data: ProgramData,
  pending: PendingCallee | null,
): AnalysisEnv {
  return { store, secrets: new Set(data.secrets), kinds: unitKinds(store, data.kinds), pending };
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
  person: ({ store }, id) => present(() => store.profiles.byId(id)),
  chat: ({ store }, id) => store.aiChats.find(id) !== undefined,
  value: ({ store }, id) => present(() => store.automationValues.byId(id)),
  automation: ({ store }, id) => store.automations.find(id) !== undefined,
  function: (env, id) =>
    pendingOf(env, id) !== undefined || env.store.automationFunctions.find(id) !== undefined,
  secret: ({ secrets }, id) => secrets.has(id),
  target: (env, id) =>
    REFERENCES.device(env, id) || REFERENCES.room(env, id) || REFERENCES.group(env, id),
};

function pendingOf(env: AnalysisEnv, id: string): PendingCallee | undefined {
  return env.pending !== null && env.pending.id === id ? env.pending : undefined;
}

function storedCallee(
  env: AnalysisEnv,
  id: string,
  pin: number | undefined,
): FunctionRevisionRow | undefined {
  const functions = env.store.automationFunctions;
  if (pin !== undefined) return functions.findRevision(id, pin);
  return functions.find(id) === undefined ? undefined : functions.latest(id);
}

export function calleeDefinition(
  env: AnalysisEnv,
  id: string,
  pin: number | undefined,
): FunctionV4 | undefined {
  const pending = pendingOf(env, id);
  if (pending !== undefined) return pending.definition;
  return storedCallee(env, id, pin)?.definition;
}

function calleePlan(env: AnalysisEnv, id: string, pin: number | undefined): Plan | undefined {
  const pending = pendingOf(env, id);
  if (pending !== undefined) return pending.plan;
  const row = storedCallee(env, id, pin);
  const stored = row === undefined ? undefined : env.store.automationPlans.find(row.plan_hash);
  return stored === undefined ? undefined : PLAN.parse(JSON.parse(stored.json));
}

function interfaceOfCallee(
  env: AnalysisEnv,
  id: string,
  pin: number | undefined,
): FunctionInterface | undefined {
  const definition = calleeDefinition(env, id, pin);
  return definition === undefined ? undefined : interfaceOf(definition);
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
    automations: (id) => env.store.automations.find(id)?.definition,
    scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
    references: (kind, id) => REFERENCES[kind](env, id),
    functions: (id, pin) => interfaceOfCallee(env, id, pin),
    secrets: env.secrets,
  };
}

function resolvePlanOf(env: AnalysisEnv): ResolvePlan {
  return (callee) => calleePlan(env, callee.fn, callee.pin);
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
