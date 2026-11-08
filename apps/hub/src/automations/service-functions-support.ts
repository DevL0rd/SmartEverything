import {
  ApiError,
  type AutomationFunctionChange,
  type AutomationFunctionInterface,
  type AutomationFunctionReply,
  type AutomationFunctionSummary,
  type AutomationFunctionUser,
  type AutomationProgramProblem,
  type FunctionRevisionRow,
  type FunctionRow,
  type FunctionV4,
  type ProgramV4,
} from '@smarteverything/domain';
import {
  classifyInterfaceChange,
  type InterfaceClassification,
} from '@smarteverything/flow/functions/compat';
import { interfaceHash, interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import type { AutomationFunctionsRepository } from '../store/repositories/automation-functions';
import type { Built, ProgramEnv } from './service-programs-analysis';
import {
  requireKnownSignals,
  requireOwnerForManifest,
  requireReachableTargets,
  requireVisibleComputers,
} from './service-reach';

export interface FunctionsEnv extends ProgramEnv {
  readonly functions: AutomationFunctionsRepository;
}

export function requireFreeName(env: FunctionsEnv, name: string, ownId?: string): void {
  const taken = env.functions.findByName(name);
  if (taken !== undefined && taken.id !== ownId) {
    throw new ApiError(
      'conflict',
      `A Custom Node named "${name}" already exists. Choose another name, or save changes to that one instead.`,
    );
  }
}

export function requireEditable(env: FunctionsEnv, caller: Caller, row: FunctionRow): void {
  if (roleOfCaller(caller) === 'owner') return;
  if (row.created_by !== null && row.created_by === profileIdOf(env.store, caller)) return;
  throw new ApiError(
    'forbidden',
    'Only the person who made this Custom Node or an owner can change it.',
  );
}

export function expectRevision(row: FunctionRow, expected: number): void {
  if (row.latest_revision !== expected) {
    throw new ApiError(
      'conflict',
      'The Custom Node changed since it was read. Reload it and save again.',
    );
  }
}

function interfaceView(program: FunctionV4): AutomationFunctionInterface {
  return {
    flavour: program.flavour,
    inputs: program.inputs,
    outputs: program.outputs,
    exits: program.exits,
  };
}

export function hashOf(program: FunctionV4): string {
  return interfaceHash(interfaceOf(program));
}

export function classify(before: FunctionV4, after: FunctionV4): InterfaceClassification {
  return classifyInterfaceChange(interfaceOf(before), interfaceOf(after));
}

export function changesOf(classification: InterfaceClassification): AutomationFunctionChange[] {
  return classification.changes.map((change) => ({ ...change }));
}

export function usersOf(env: FunctionsEnv, id: string): AutomationFunctionUser[] {
  const { automations, functions } = env.functions.users(id);
  return [
    ...automations.map((user) => ({ kind: 'automation' as const, ...user })),
    ...functions.map((user) => ({ kind: 'function' as const, ...user })),
  ];
}

export function summaryOf(
  env: FunctionsEnv,
  caller: Caller,
  row: FunctionRow,
  latest: FunctionRevisionRow,
): AutomationFunctionSummary {
  const owner = roleOfCaller(caller) === 'owner';
  const own = row.created_by !== null && row.created_by === profileIdOf(env.store, caller);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    icon: row.icon,
    editable: owner || own,
    revision: latest.revision,
    interface: interfaceView(latest.definition),
    interfaceHash: latest.interface_hash,
    users: usersOf(env, row.id).length,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

export function authorise(
  env: FunctionsEnv,
  caller: Caller,
  program: ProgramV4,
  built: Built,
): void {
  const { store } = env;
  if (program.kind === 'automation') requireKnownSignals(store, program);
  requireOwnerForManifest(caller, built.manifest);
  requireVisibleComputers(store, caller, built.manifest);
  requireReachableTargets(store, caller, built.manifest);
}

type ReplyMore = Partial<Omit<AutomationFunctionReply, 'ok' | 'summary' | 'problems'>> & {
  readonly problems?: readonly AutomationProgramProblem[];
};

export function replyOf(
  base: { readonly ok: boolean; readonly summary: string },
  more: ReplyMore = {},
): AutomationFunctionReply {
  return {
    id: null,
    revision: null,
    compat: null,
    changes: [],
    affected: [],
    ...more,
    ok: base.ok,
    summary: base.summary,
    problems: [...(more.problems ?? [])],
  };
}
