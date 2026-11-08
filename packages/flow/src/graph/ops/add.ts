import type { GraphNode, GraphPath, NodeKindLookup, ProgramV4 } from '@smarteverything/domain';
import { fillNode, fillTrigger } from './fill';
import {
  claimId,
  claimKey,
  isTriggerKind,
  nodeOf,
  takenOf,
  triggersOf,
  type Ids,
  type Taken,
} from './identity';
import { guardFreeKeys } from './refs';
import { change } from './util';
import type { Created, OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { AddOp, PatchOp } from './schema';
import { outputsOfNode, requireOutput, setTarget } from './wires';

const FORK = 'flow.parallel';
const JOIN = 'flow.join';
const DEFAULT_PATHS: readonly GraphPath[] = [{ name: 'path1' }, { name: 'path2' }];

function createdOf(...nodes: readonly GraphNode[]): readonly Created[] {
  return nodes.map((node) => ({ key: node.key, id: node.id }));
}

function addTrigger(next: ProgramV4, op: AddOp, taken: Taken, env: OpEnv): Outcome {
  if (next.kind !== 'automation') refuse('not_allowed', 'only an automation has triggers');
  if (op.after !== undefined) refuse('not_allowed', 'a trigger is not wired into a step');
  const trigger = fillTrigger(op.node, taken, env);
  guardFreeKeys(next, [trigger.key]);
  triggersOf(next).push(trigger);
  return outcome(next, [{ op: 'remove', key: trigger.key }], { created: createdOf(trigger) });
}

function pairJoin(next: ProgramV4, fork: GraphNode, op: AddOp, ids: Ids): GraphNode {
  const join: GraphNode = {
    id: claimId(ids.taken, op.join?.id, ids.env),
    key: claimKey(ids.taken, op.join?.key, JOIN),
    kind: JOIN,
  };
  guardFreeKeys(next, [join.key]);
  const paths = (fork.paths ?? DEFAULT_PATHS).map((path) =>
    path.to === undefined ? { ...path, to: join.key } : path,
  );
  change(fork, { paths });
  return join;
}

function carryPort(carrier: GraphNode, kinds: NodeKindLookup): string | undefined {
  const outputs = outputsOfNode(carrier, kinds);
  return (
    outputs.find((out) => out.role === 'next') ?? outputs.find((out) => out.role === 'branch')
  )?.port;
}

function splice(
  next: ProgramV4,
  after: NonNullable<AddOp['after']>,
  nodes: { readonly added: GraphNode; readonly carrier: GraphNode },
  kinds: NodeKindLookup,
): readonly PatchOp[] {
  const { added, carrier } = nodes;
  const holder = nodeOf(next, after.key);
  const old = requireOutput(holder, after.port, kinds).target;
  setTarget(holder, after.port, added.key);
  if (old === undefined) return [];
  const port = carryPort(carrier, kinds);
  if (port === undefined) {
    return refuse('not_allowed', `${carrier.kind} has no exit to carry on to "${old}"`);
  }
  if (requireOutput(carrier, port, kinds).target !== undefined) {
    refuse(
      'not_allowed',
      `the new node already leads on from "${port}"; leave it out when using after`,
    );
  }
  setTarget(carrier, port, old);
  return [{ op: 'connect', from: after.key, port: after.port, to: old }];
}

export function applyAdd(program: ProgramV4, op: AddOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const taken = takenOf(next);
  if (isTriggerKind(op.node.kind)) return addTrigger(next, op, taken, env);
  if (op.join !== undefined && op.node.kind !== FORK) {
    refuse('not_allowed', 'join belongs to adding flow.parallel only');
  }
  const node = fillNode(op.node, taken, env);
  guardFreeKeys(next, [node.key]);
  const join = node.kind === FORK ? pairJoin(next, node, op, { taken, env }) : undefined;
  next.nodes.push(node, ...(join === undefined ? [] : [join]));
  const restore =
    op.after === undefined
      ? []
      : splice(next, op.after, { added: node, carrier: join ?? node }, env.kinds);
  return outcome(next, [{ op: 'remove', key: node.key }, ...restore], {
    created: createdOf(node, ...(join === undefined ? [] : [join])),
  });
}
