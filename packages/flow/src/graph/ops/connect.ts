import {
  ERROR_EXIT_PORT,
  canRouteOnError,
  type GraphNode,
  type NodeKindLookup,
  type NodePolicy,
  type ProgramV4,
} from '@smarteverything/domain';
import { canConnect } from './can-connect';
import { nodeOf } from './identity';
import type { OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { ConnectOp, DisconnectOp, PatchOp } from './schema';
import { change } from './util';
import { requireOutput, setTarget } from './wires';

function restoreWire(from: string, port: string, previous: string | undefined): PatchOp {
  return previous === undefined
    ? { op: 'disconnect', from, port }
    : { op: 'connect', from, port, to: previous };
}

function restorePolicy(key: string, previous: NodePolicy | undefined): PatchOp {
  return { op: 'set', key, policy: previous ?? null };
}

function withoutRoute(policy: NodePolicy | undefined): NodePolicy | undefined {
  if (policy?.onError !== 'route') return policy;
  const rest: NodePolicy = { ...policy };
  Reflect.deleteProperty(rest, 'onError');
  return Object.keys(rest).length === 0 ? undefined : rest;
}

function setPolicy(node: GraphNode, policy: NodePolicy | undefined): void {
  if (policy === undefined) Reflect.deleteProperty(node, 'policy');
  else change(node, { policy });
}

function previousTarget(
  holder: GraphNode,
  port: string,
  kinds: NodeKindLookup,
): string | undefined {
  if (port === ERROR_EXIT_PORT) return holder.to?.[ERROR_EXIT_PORT];
  return requireOutput(holder, port, kinds).target;
}

function routed(program: ProgramV4, from: string): ProgramV4 {
  const next = structuredClone(program);
  const holder = nodeOf(next, from);
  setPolicy(holder, { ...holder.policy, onError: 'route' });
  return next;
}

function requireErrorExit(holder: GraphNode, kinds: NodeKindLookup): void {
  if (canRouteOnError(holder.kind, kinds)) return;
  refuse(
    'unknown_port',
    `"${holder.key}" (${holder.kind}) cannot fail, so it has no exit "onError"`,
  );
}

export function applyConnect(program: ProgramV4, op: ConnectOp, env: OpEnv): Outcome {
  const { kinds } = env;
  const errorExit = op.port === ERROR_EXIT_PORT;
  if (errorExit) requireErrorExit(nodeOf(program, op.from), kinds);
  const verdict = canConnect(
    errorExit ? routed(program, op.from) : program,
    { from: op.from, port: op.port, to: op.to },
    kinds,
  );
  if (!verdict.ok) refuse('cannot_connect', verdict.message);
  const next = structuredClone(program);
  const holder = nodeOf(next, op.from);
  const previous = previousTarget(holder, op.port, kinds);
  const policy = holder.policy;
  setTarget(holder, op.port, op.to);
  if (!errorExit) return outcome(next, [restoreWire(op.from, op.port, previous)]);
  setPolicy(holder, { ...policy, onError: 'route' });
  return outcome(next, [restoreWire(op.from, op.port, previous), restorePolicy(op.from, policy)]);
}

export function applyDisconnect(program: ProgramV4, op: DisconnectOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const holder = nodeOf(next, op.from);
  const previous = previousTarget(holder, op.port, env.kinds);
  if (previous === undefined) {
    refuse('bad_target', `"${op.port}" of "${op.from}" has no wire to remove`);
  }
  const policy = holder.policy;
  setTarget(holder, op.port, undefined);
  const undo: PatchOp[] = [{ op: 'connect', from: op.from, port: op.port, to: previous }];
  if (op.port === ERROR_EXIT_PORT) {
    setPolicy(holder, withoutRoute(policy));
    undo.push(restorePolicy(op.from, policy));
  }
  return outcome(next, undo);
}
