import type { FlowNode, PortValue } from '@smarteverything/domain';
import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import { claimId, claimKey, takenOf } from './fill';
import { guardFreeKeys } from './guard';
import { readersOf } from './refs';
import type { OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { UnwrapOp, WrapOp } from './schema';
import { entryOf, scopeNodes } from './target';
import { canonical, compact } from './util';

const LOOP_KINDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
  'flow.forever',
]);

const IF_KIND = 'flow.if';
const TRY_KIND = 'flow.try';

interface ContainerSpec {
  readonly id: string;
  readonly key: string;
  readonly kind: string;
  readonly ports: Record<string, PortValue> | undefined;
  readonly policy: FlowNode['policy'];
  readonly label: string | undefined;
  readonly note: string | undefined;
  readonly enabled: boolean | undefined;
  readonly when: PortValue | undefined;
  readonly rowId: string | undefined;
}

function shell(spec: ContainerSpec): FlowNode {
  return compact({
    id: spec.id,
    key: spec.key,
    kind: spec.kind,
    ports: spec.ports,
    policy: spec.policy,
    label: spec.label,
    note: spec.note,
    enabled: spec.enabled,
  });
}

function build(spec: ContainerSpec, children: FlowNode[]): FlowNode {
  const node = shell(spec);
  if (spec.kind !== IF_KIND && spec.when !== undefined) {
    refuse('not_allowed', '"when" belongs to wrapping in flow.if only');
  }
  if (spec.kind === IF_KIND) {
    if (spec.when === undefined || spec.rowId === undefined) {
      refuse('not_allowed', 'wrapping in flow.if needs a "when" condition');
    }
    node.branches = [{ id: spec.rowId, when: spec.when, scope: { nodes: children } }];
  } else if (spec.kind === TRY_KIND) {
    node.scopes = { try: { nodes: children } };
  } else if (LOOP_KINDS.has(spec.kind)) {
    node.scopes = { body: { nodes: children } };
  } else {
    refuse('not_allowed', `${spec.kind} cannot wrap nodes (use a loop, flow.try or flow.if)`);
  }
  return node;
}

function contiguousStart(keys: readonly string[], list: readonly FlowNode[]): number {
  const positions = keys.map((key) => list.findIndex((node) => node.key === key));
  if (positions.some((position) => position < 0)) {
    refuse('not_allowed', 'every wrapped key must be a node of the same scope');
  }
  const first = Math.min(...positions);
  if (new Set(keys).size !== keys.length || Math.max(...positions) - first + 1 !== keys.length) {
    refuse('not_allowed', 'the wrapped nodes must follow each other, each listed once');
  }
  return first;
}

export function applyWrap(program: Program, op: WrapOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const [firstKey] = op.keys;
  const entry = entryOf(indexProgram(next), firstKey);
  if (entry.kind === 'trigger') refuse('not_allowed', 'a trigger cannot be wrapped');
  const list = scopeNodes(next, entry.scope);
  const start = contiguousStart(op.keys, list);
  const taken = takenOf(next);
  const key = claimKey(taken, op.key, op.kind);
  const spec: ContainerSpec = {
    id: claimId(taken, op.id, env),
    key,
    kind: op.kind,
    ports: op.ports,
    policy: op.policy,
    label: op.label,
    note: op.note,
    enabled: op.enabled,
    when: op.when,
    rowId: op.when === undefined ? undefined : claimId(taken, op.rowId, env),
  };
  guardFreeKeys(next, [key]);
  const children = list.splice(start, op.keys.length);
  list.splice(start, 0, build(spec, children));
  return outcome(next, [{ op: 'unwrap', key }], { created: [{ key, id: spec.id }] });
}

function childrenOf(node: FlowNode): FlowNode[] | undefined {
  const row = node.branches?.[0];
  return row?.scope.nodes ?? node.scopes?.['body']?.nodes ?? node.scopes?.['try']?.nodes;
}

function specOf(node: FlowNode): {
  readonly spec: ContainerSpec;
  readonly children: FlowNode[];
  readonly keys: WrapOp['keys'];
} {
  const children = childrenOf(node);
  const [head, ...rest] = children ?? [];
  if (head === undefined || children === undefined) {
    return refuse('not_allowed', `"${node.key}" is not a container holding nodes (use remove)`);
  }
  const row = node.branches?.[0];
  const spec: ContainerSpec = {
    id: node.id,
    key: node.key,
    kind: node.kind,
    ports: node.ports,
    policy: node.policy,
    label: node.label,
    note: node.note,
    enabled: node.enabled,
    when: row?.when,
    rowId: row?.id,
  };
  return { spec, children, keys: [head.key, ...rest.map((child) => child.key)] };
}

export function applyUnwrap(program: Program, op: UnwrapOp): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(indexProgram(next), op.key);
  if (entry.kind === 'trigger') refuse('not_allowed', 'a trigger is not a container');
  const { spec, children, keys } = specOf(entry.node);
  if (canonical(build(spec, children)) !== canonical(entry.node)) {
    refuse('not_allowed', `"${op.key}" holds more than one plain scope, so it cannot be unwrapped`);
  }
  if (readersOf(next, new Set([op.key])).length > 0) {
    refuse('referenced', `"${op.key}" is read by an expression, so it cannot be unwrapped`);
  }
  scopeNodes(next, entry.scope).splice(entry.index, 1, ...children);
  const wrap: WrapOp = compact({
    op: 'wrap' as const,
    keys,
    kind: spec.kind,
    key: spec.key,
    id: spec.id,
    ports: spec.ports,
    when: spec.when,
    rowId: spec.rowId,
    policy: spec.policy,
    label: spec.label,
    note: spec.note,
    enabled: spec.enabled,
  });
  return outcome(next, [wrap]);
}
