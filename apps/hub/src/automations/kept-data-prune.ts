import type { CallRef } from '@smarteverything/flow/functions/calls';
import { callsOf } from '@smarteverything/flow/functions/calls';
import type { Program } from '@smarteverything/flow/program/walk';
import type { FunctionV3 } from '@smarteverything/domain';
import type { AutomationNodeStateRepository } from '../store/repositories/automation-node-state';
import { pruneKeptRows } from './world-v3/kept-data';

export type ResolveCall = (call: CallRef) => Program | undefined;

export function reachableCallNodes(program: Program, resolve: ResolveCall): ReadonlySet<string> {
  const live = new Set<string>();
  const seen = new Set<string>();
  const queue: Program[] = [program];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const call of callsOf(next)) {
      live.add(call.nodeId);
      const label = `${call.functionId}@${String(call.pin)}`;
      if (seen.has(label)) continue;
      seen.add(label);
      const callee = resolve(call);
      if (callee !== undefined) queue.push(callee);
    }
  }
  return live;
}

interface Defined {
  readonly definition: FunctionV3;
}

export interface FunctionDefinitions {
  readonly find: (functionId: string) => object | undefined;
  readonly findRevision: (functionId: string, revision: number) => Defined | undefined;
  readonly latest: (functionId: string) => Defined;
}

export function resolveFromStore(functions: FunctionDefinitions): ResolveCall {
  return (call) => {
    if (call.pin !== undefined)
      return functions.findRevision(call.functionId, call.pin)?.definition;
    return functions.find(call.functionId) === undefined
      ? undefined
      : functions.latest(call.functionId).definition;
  };
}

export interface KeptPruneStore {
  readonly automationNodeState: Pick<AutomationNodeStateRepository, 'remove' | 'forAutomation'>;
  readonly automationFunctions: FunctionDefinitions;
}

export function pruneKeptData(
  store: KeptPruneStore,
  automationId: string,
  program: Program,
): number {
  const live = reachableCallNodes(program, resolveFromStore(store.automationFunctions));
  return pruneKeptRows(store.automationNodeState, automationId, live);
}
