import {
  EMPTY_LAYOUT,
  type AutomationFunctionDetail,
  type AutomationFunctionReply,
  type AutomationFunctionSummary,
  type AutomationProgramProblem,
  type FunctionV3,
  type Layout,
} from '@smarteverything/domain';
import { profileIdOf, type Caller } from '../server/auth';
import { analyse, planValue } from './service-programs-analysis';
import { authorOf } from './service-reach';
import {
  authorise,
  builtinOf,
  builtinSummary,
  changesOf,
  classify,
  expectRevision,
  hashOf,
  replyOf,
  requireCustom,
  requireEditable,
  summaryOf,
  usersOf,
  type FunctionsEnv,
} from './service-functions-support';
import { updateCallers } from './service-functions-callers';
import { extract } from './service-functions-extract';
import type {
  AutomationFunctionCallersReply,
  AutomationFunctionExtractReply,
  AutomationFunctionExtractRequest,
  AutomationFunctionMapping,
} from '@smarteverything/domain';

export type { BuiltinFunction, FunctionsEnv } from './service-functions-support';

interface NewFunctionInput {
  readonly name: string;
  readonly definition: FunctionV3;
  readonly layout?: Layout | undefined;
}

interface FunctionSaveInput {
  readonly definition: FunctionV3;
  readonly layout?: Layout | undefined;
  readonly name?: string | undefined;
  readonly expectedRevision: number;
  readonly confirmBreaking: boolean;
}

export interface AutomationFunctions {
  readonly list: (caller: Caller) => AutomationFunctionSummary[];
  readonly get: (caller: Caller, id: string) => AutomationFunctionDetail;
  readonly create: (caller: Caller, input: NewFunctionInput) => AutomationFunctionReply;
  readonly save: (caller: Caller, id: string, input: FunctionSaveInput) => AutomationFunctionReply;
  readonly updateCallers: (
    caller: Caller,
    id: string,
    mapping: AutomationFunctionMapping,
  ) => AutomationFunctionCallersReply;
  readonly extract: (
    caller: Caller,
    request: AutomationFunctionExtractRequest,
  ) => AutomationFunctionExtractReply;
  readonly remove: (caller: Caller, id: string) => void;
}

function list(env: FunctionsEnv, caller: Caller): AutomationFunctionSummary[] {
  const custom = env.functions
    .list()
    .map((row) => summaryOf(env, caller, row, env.functions.latest(row.id)));
  const builtins = env.builtins.map((builtin) => builtinSummary(env, builtin));
  return [...custom, ...builtins].sort((left, right) => left.name.localeCompare(right.name));
}

function get(env: FunctionsEnv, caller: Caller, id: string): AutomationFunctionDetail {
  const builtin = builtinOf(env, id);
  if (builtin !== undefined) {
    return {
      ...builtinSummary(env, builtin),
      program: builtin.program,
      layout: EMPTY_LAYOUT,
      usedBy: usersOf(env, id),
    };
  }
  const row = env.functions.byId(id);
  const latest = env.functions.latest(id);
  return {
    ...summaryOf(env, caller, row, latest),
    program: latest.definition,
    layout: latest.layout,
    usedBy: usersOf(env, id),
  };
}

function refused(problems: readonly AutomationProgramProblem[]): AutomationFunctionReply {
  const errors = problems.filter((found) => found.severity === 'error').length;
  const summary = `Refused with ${String(errors)} error(s). Nothing was saved.`;
  return replyOf({ ok: false, summary }, { problems });
}

function create(
  env: FunctionsEnv,
  caller: Caller,
  input: NewFunctionInput,
): AutomationFunctionReply {
  const analysis = analyse(env, input.definition);
  const { built } = analysis;
  if (built === undefined) return refused(analysis.problems);
  authorise(env, caller, input.definition, built);
  const row = env.store.write(() =>
    env.functions.create({
      name: input.name,
      program: input.definition,
      layout: input.layout ?? EMPTY_LAYOUT,
      interfaceHash: hashOf(input.definition),
      compat: 'compatible',
      planHash: env.plans.put('function', planValue(built.plan)),
      author: authorOf(env.store, caller),
      createdBy: profileIdOf(env.store, caller),
    }),
  );
  return replyOf(
    { ok: true, summary: `Saved revision 1 of ${row.name}.` },
    {
      id: row.id,
      revision: row.latest_revision,
      compat: 'compatible',
      problems: analysis.problems,
    },
  );
}

function save(
  env: FunctionsEnv,
  caller: Caller,
  id: string,
  input: FunctionSaveInput,
): AutomationFunctionReply {
  requireCustom(env, id);
  const row = env.functions.byId(id);
  requireEditable(env, caller, row);
  expectRevision(row, input.expectedRevision);
  const analysis = analyse(env, input.definition);
  const { built } = analysis;
  if (built === undefined) return refused(analysis.problems);
  const classification = classify(env.functions.latest(id).definition, input.definition);
  const changes = changesOf(classification);
  const affected = classification.result === 'breaking' ? usersOf(env, id) : [];
  if (classification.result === 'breaking' && !input.confirmBreaking) {
    const summary = `This breaks ${String(affected.length)} caller(s). Nothing was saved; confirm to save.`;
    return replyOf(
      { ok: false, summary },
      { id, revision: row.latest_revision, compat: 'breaking', changes, affected },
    );
  }
  authorise(env, caller, input.definition, built);
  const saved = env.store.write(() => {
    const revised = env.functions.revise(id, {
      program: input.definition,
      layout: input.layout ?? env.functions.latest(id).layout,
      interfaceHash: hashOf(input.definition),
      compat: classification.result,
      planHash: env.plans.put('function', planValue(built.plan)),
      author: authorOf(env.store, caller),
      expectedRevision: input.expectedRevision,
    });
    return input.name === undefined ? revised : env.functions.rename(id, input.name);
  });
  const summary = `Saved revision ${String(saved.latest_revision)} (${classification.result}).`;
  return replyOf(
    { ok: true, summary },
    {
      id,
      revision: saved.latest_revision,
      compat: classification.result,
      changes,
      affected,
      problems: analysis.problems,
    },
  );
}

function remove(env: FunctionsEnv, caller: Caller, id: string): void {
  requireCustom(env, id);
  requireEditable(env, caller, env.functions.byId(id));
  env.functions.remove(id);
}

export function automationFunctions(env: FunctionsEnv): AutomationFunctions {
  return {
    list: (caller) => list(env, caller),
    get: (caller, id) => get(env, caller, id),
    create: (caller, input) => create(env, caller, input),
    save: (caller, id, input) => save(env, caller, id, input),
    updateCallers: (caller, id, mapping) => updateCallers(env, caller, id, mapping),
    extract: (caller, request) => extract(env, caller, request),
    remove: (caller, id): void => {
      remove(env, caller, id);
    },
  };
}
