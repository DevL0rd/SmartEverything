import {
  FLOW_SCOPE_OUTPUTS,
  JSON_VALUE,
  NODE_REGISTRY,
  type AutomationProgramProblem,
  type AutomationProgramReply,
  type JsonValue,
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
import { applyPatch, type PatchResult } from '@smarteverything/flow/ops/reducer';
import { PATCH_OPS, type PatchOp } from '@smarteverything/flow/ops/schema';
import type { Program } from '@smarteverything/flow/program/walk';
import type { FunctionRevisionRow } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
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

export const kindOf = (id: string): ReturnType<typeof NODE_REGISTRY.get> => NODE_REGISTRY.get(id);

const ACTION = z.record(z.string(), JSON_VALUE);

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

export function lintContextOf(env: AnalysisEnv): LintContext {
  return {
    kinds: kindOf,
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

function lowered(env: AnalysisEnv, program: Program, problems: readonly Finding[]): Analysis {
  const result: LowerResult = lower(program, { kinds: kindOf });
  const shown = problems.map(problemOf);
  if (!result.ok)
    return { problems: [...shown, ...result.problems.map(lowerProblemOf)], built: undefined };
  const manifest = manifestOf(result.plan, kindOf, resolvePlanOf(env));
  return { problems: shown, built: { plan: result.plan, manifest } };
}

export function analyse(env: AnalysisEnv, program: Program): Analysis {
  const findings = lint(program, lintContextOf(env));
  return hasErrors(findings)
    ? { problems: findings.map(problemOf), built: undefined }
    : lowered(env, program, findings);
}

export function lintProblems(
  env: AnalysisEnv,
  program: Program,
): readonly AutomationProgramProblem[] {
  return lint(program, lintContextOf(env)).map(problemOf);
}

export function planValue(plan: Plan): JsonValue {
  return JSON_VALUE.parse(JSON.parse(canonicalPlan(plan)));
}

function parseOps(ops: readonly unknown[]): readonly PatchOp[] {
  const parsed = PATCH_OPS.safeParse(ops);
  if (!parsed.success) throw invalid('patch operations', parsed.error);
  return parsed.data;
}

export function refusedPatch(
  result: Extract<PatchResult, { ok: false }>,
): AutomationProgramProblem {
  const where = result.opIndex === undefined ? '' : ` (operation ${String(result.opIndex + 1)})`;
  return failure(result.code, `${result.reason}${where}`);
}

export function patched(program: Program, ops: readonly unknown[]): PatchResult {
  return applyPatch(program, parseOps(ops));
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
