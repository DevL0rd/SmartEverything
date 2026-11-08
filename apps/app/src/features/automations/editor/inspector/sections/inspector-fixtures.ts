import type { NodeKindLookup } from '@smarteverything/domain';
import type { DescribeContext, NodeRegistry } from '@smarteverything/domain';
import { NODE_REGISTRY, wireScopeOf } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { NodeView } from './node-view';
import { nodeView } from './node-view';
import type { InspectorActions, InspectorEnv } from './section-types';

export function describeOf(registry: NodeRegistry): DescribeContext {
  return { kinds: (id) => registry.get(id), names: () => undefined };
}

export const DESCRIBE: DescribeContext = describeOf(NODE_REGISTRY);

export function viewByKey(
  program: Program,
  key: string,
  registry: NodeRegistry = NODE_REGISTRY,
): NodeView {
  const index = indexProgram(program);
  const entry = index.byKey.get(key);
  const view = entry === undefined ? undefined : nodeView(index, entry.node.id, registry);
  if (view === undefined) throw new Error(`the fixture has no node "${key}"`);
  return view;
}

export function envOf(
  program: Program,
  extra: Partial<InspectorEnv> = {},
  registry: NodeRegistry = NODE_REGISTRY,
): InspectorEnv {
  const describe = describeOf(registry);
  return {
    graph: unstructure(program, registry),
    program,
    index: indexProgram(program),
    registry,
    describe,
    scope: wireScopeOf(program, describe),
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

export function applied(program: Program, ops: readonly PatchOp[], kinds: NodeKindLookup): Program {
  let issued = 0;
  const result = applyPatch(unstructure(program, kinds), ops, {
    allowProblems: true,
    newId: () => `00000000-0000-4000-8000-${String((issued += 1)).padStart(12, '0')}`,
    kinds,
  });
  if (!result.ok) throw new Error(`the patch was refused: ${result.reason}`);
  const back = structuredOf(result.program, kinds);
  if (back.kind !== 'structured') throw new Error('the patched program no longer reads as steps');
  return back.tree;
}

export function recordingActions(): {
  readonly actions: InspectorActions;
  readonly calls: string[];
} {
  const calls: string[] = [];
  const actions: InspectorActions = {
    apply: (ops) => calls.push(`apply:${JSON.stringify(ops)}`),
    intent: (intent) => calls.push(`intent:${JSON.stringify(intent)}`),
    jump: (nodeId) => calls.push(`jump:${nodeId}`),
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
    deleteStep: (id) => calls.push(`delete:${id}`),
  };
  return { actions, calls };
}
