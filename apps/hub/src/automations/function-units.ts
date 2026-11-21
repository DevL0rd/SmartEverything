import {
  EMPTY_LAYOUT,
  type AutomationFunctionDetail,
  type AutomationFunctionReply,
  type AutomationFunctionSummary,
  type AutomationProgramProblem,
  type FunctionRow,
  type FunctionV4,
  type Layout,
} from '@smarteverything/domain';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import { profileIdOf, type Caller } from '../server/auth';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import type { ProgramData } from './program-data';
import { analyse, analysisEnv, planValue, type AnalysisEnv } from './service-programs-analysis';
import { authorOf, reached, type Reached } from './service-reach';
import {
  authorise,
  changesOf,
  classify,
  expectRevision,
  hashOf,
  replyOf,
  requireEditable,
  requireFreeName,
  summaryOf,
  usersOf,
} from './service-functions-support';

export interface NewFunctionInput {
  readonly name: string;
  readonly definition: FunctionV4;
  readonly layout?: Layout | undefined;
}

export interface FunctionSaveInput {
  readonly definition: FunctionV4;
  readonly layout?: Layout | undefined;
  readonly name?: string | undefined;
  readonly expectedRevision: number;
  readonly confirmBreaking: boolean;
}

interface Turn {
  readonly data: ProgramData;
  readonly caller: Caller;
  readonly authority: ConversationAuthority | undefined;
}

export interface CreateFunctionInput extends Turn {
  readonly input: NewFunctionInput;
}

export interface SaveFunctionInput extends Turn {
  readonly id: string;
  readonly input: FunctionSaveInput;
}

export interface Asked {
  readonly caller: Caller;
  readonly id: string;
}

function list(store: Store, caller: Caller): AutomationFunctionSummary[] {
  const env = { store };
  const functions = store.automationFunctions;
  return functions
    .list()
    .map((row) => summaryOf(env, caller, row, functions.latest(row.id)))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function get(store: Store, { caller, id }: Asked): AutomationFunctionDetail {
  const env = { store };
  const row = store.automationFunctions.byId(id);
  const latest = store.automationFunctions.latest(id);
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
  env: AnalysisEnv,
  caller: Caller,
  input: NewFunctionInput,
): AutomationFunctionReply {
  requireFreeName(env, input.name);
  const analysis = analyse(env, input.definition);
  const { built } = analysis;
  if (built === undefined) return refused(analysis.problems);
  authorise(env, caller, input.definition, built);
  const { store } = env;
  const row = store.automationFunctions.create(
    {
      name: input.name,
      program: input.definition,
      layout: input.layout ?? EMPTY_LAYOUT,
      interfaceHash: hashOf(input.definition),
      compat: 'compatible',
      planHash: store.automationPlans.put('function', planValue(built.plan)),
      author: authorOf(caller),
      createdBy: profileIdOf(caller),
    },
    env.kinds,
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

function breakingRefusal(
  row: FunctionRow,
  changes: AutomationFunctionReply['changes'],
  affected: AutomationFunctionReply['affected'],
): AutomationFunctionReply {
  const summary = `This breaks ${String(affected.length)} caller(s). Nothing was saved; confirm to save.`;
  return replyOf(
    { ok: false, summary },
    { id: row.id, revision: row.latest_revision, compat: 'breaking', changes, affected },
  );
}

function editable(
  env: AnalysisEnv,
  caller: Caller,
  id: string,
  input: FunctionSaveInput,
): FunctionRow {
  const row = env.store.automationFunctions.byId(id);
  requireEditable(caller, row);
  expectRevision(row, input.expectedRevision);
  if (input.name !== undefined) requireFreeName(env, input.name, id);
  return row;
}

function save(
  env: AnalysisEnv,
  caller: Caller,
  id: string,
  input: FunctionSaveInput,
): AutomationFunctionReply {
  const row = editable(env, caller, id, input);
  const analysis = analyse(env, input.definition);
  const { built } = analysis;
  if (built === undefined) return refused(analysis.problems);
  const { store } = env;
  const functions = store.automationFunctions;
  const latest = functions.latest(id);
  const classification = classify(latest.definition, input.definition);
  const changes = changesOf(classification);
  const affected = classification.result === 'breaking' ? usersOf(env, id) : [];
  if (classification.result === 'breaking' && !input.confirmBreaking) {
    return breakingRefusal(row, changes, affected);
  }
  authorise(env, caller, input.definition, built);
  const revised = functions.revise(
    id,
    {
      program: input.definition,
      layout: input.layout ?? latest.layout,
      interfaceHash: hashOf(input.definition),
      compat: classification.result,
      planHash: store.automationPlans.put('function', planValue(built.plan)),
      author: authorOf(caller),
      expectedRevision: input.expectedRevision,
    },
    env.kinds,
  );
  const saved = input.name === undefined ? revised : functions.rename(id, input.name);
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

function remove(store: Store, { caller, id }: Asked): void {
  requireEditable(caller, store.automationFunctions.byId(id));
  store.automationFunctions.remove(id);
}

export const AUTOMATION_FUNCTIONS_UNIT = storeUnit(list);

export const AUTOMATION_FUNCTION_UNIT = storeUnit(get);

export const CREATE_AUTOMATION_FUNCTION_UNIT = storeUnit(
  (store, turn: CreateFunctionInput): Reached<AutomationFunctionReply> =>
    withExecutionAuthority(turn.authority, () =>
      reached(() => create(analysisEnv(store, turn.data, null), turn.caller, turn.input)),
    ),
);

export const SAVE_AUTOMATION_FUNCTION_UNIT = storeUnit(
  (store, turn: SaveFunctionInput): Reached<AutomationFunctionReply> =>
    withExecutionAuthority(turn.authority, () =>
      reached(() => save(analysisEnv(store, turn.data, null), turn.caller, turn.id, turn.input)),
    ),
);

export const REMOVE_AUTOMATION_FUNCTION_UNIT = storeUnit(remove);
