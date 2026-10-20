import type { DescribeContext } from '@smarteverything/domain';
import { NODE_REGISTRY, wireScopeOf } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { NodeView } from './node-view';
import { nodeView } from './node-view';
import type { InspectorActions, InspectorEnv } from './section-types';

export const DESCRIBE: DescribeContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  names: () => undefined,
};

export function viewByKey(program: Program, key: string): NodeView {
  const index = indexProgram(program);
  const entry = index.byKey.get(key);
  const view = entry === undefined ? undefined : nodeView(index, entry.node.id, NODE_REGISTRY);
  if (view === undefined) throw new Error(`the fixture has no node "${key}"`);
  return view;
}

export function envOf(program: Program, extra: Partial<InspectorEnv> = {}): InspectorEnv {
  return {
    program,
    index: indexProgram(program),
    registry: NODE_REGISTRY,
    describe: DESCRIBE,
    scope: wireScopeOf(program, DESCRIBE),
    findings: [],
    functions: new Map(),
    exits: [],
    breakpoint: false,
    freePosition: false,
    run: null,
    subjectChoices: undefined,
    renderValue: () => null,
    locked: false,
    ...extra,
  };
}

export function applied(program: Program, ops: readonly PatchOp[]): Program {
  const result = applyPatch(program, ops);
  if (!result.ok) throw new Error(`the patch was refused: ${result.reason}`);
  return result.program;
}

export function recordingActions(): {
  readonly actions: InspectorActions;
  readonly calls: string[];
} {
  const calls: string[] = [];
  const actions: InspectorActions = {
    apply: (ops) => calls.push(`apply:${JSON.stringify(ops)}`),
    editRows: (key, edits) => calls.push(`rows:${key}:${JSON.stringify(edits)}`),
    gesture: (run) => {
      calls.push('gesture');
      run();
    },
    fix: (id) => calls.push(`fix:${id}`),
    copyReference: (text) => calls.push(`copy:${text}`),
    openHelp: (kindId) => calls.push(`help:${kindId}`),
    setFreePosition: (id, free) => calls.push(`free:${id}:${String(free)}`),
    selectIteration: (index) => calls.push(`iteration:${String(index)}`),
    editInterface: () => calls.push('interface'),
  };
  return { actions, calls };
}
