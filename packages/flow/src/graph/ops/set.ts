import {
  modesOf,
  type GraphNode,
  type NodeKindLookup,
  type NodePolicy,
  type PortValue,
  type ProgramV4,
} from '@smarteverything/domain';
import { entryOf, type Entry } from './identity';
import type { OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, SetOp, UnsetOp } from './schema';
import { change, compact } from './util';

interface Common {
  ports?: Record<string, PortValue> | undefined;
  label?: string | undefined;
  note?: string | undefined;
  enabled?: boolean | undefined;
}

function edit<T>(
  incoming: T | null | undefined,
  read: () => T | undefined,
  write: (value: T | undefined) => void,
): T | null | undefined {
  if (incoming === undefined) return undefined;
  const previous = read();
  write(incoming ?? undefined);
  return previous ?? null;
}

function mergePorts(
  holder: Common,
  incoming: Record<string, PortValue> | undefined,
): { readonly restore: Record<string, PortValue>; readonly added: string[] } {
  const restore: Record<string, PortValue> = {};
  const added: string[] = [];
  const ports = holder.ports ?? {};
  for (const [name, value] of Object.entries(incoming ?? {})) {
    const previous = ports[name];
    if (previous === undefined) added.push(name);
    else restore[name] = previous;
    ports[name] = value;
  }
  if (added.length + Object.keys(restore).length > 0) change(holder, { ports });
  return { restore, added };
}

function commonBack(holder: Common, op: SetOp): Partial<SetOp> {
  return {
    label: edit(
      op.label,
      () => holder.label,
      (label) => {
        change(holder, { label });
      },
    ),
    note: edit(
      op.note,
      () => holder.note,
      (note) => {
        change(holder, { note });
      },
    ),
    enabled: edit(
      op.enabled,
      () => holder.enabled,
      (enabled) => {
        change(holder, { enabled });
      },
    ),
  };
}

function policyAfter(node: GraphNode, op: SetOp): NodePolicy | undefined {
  const next: NodePolicy = {
    ...(op.policy === undefined ? node.policy : (op.policy ?? undefined)),
  };
  if (op.mode === null) Reflect.deleteProperty(next, 'mode');
  else if (op.mode !== undefined) next.mode = op.mode;
  if (op.timeout === null) Reflect.deleteProperty(next, 'timeout');
  else if (op.timeout !== undefined) next.timeout = op.timeout;
  return Object.keys(next).length === 0 ? undefined : next;
}

function policyBack(node: GraphNode, op: SetOp): NodePolicy | null | undefined {
  if (op.policy === undefined && op.mode === undefined && op.timeout === undefined) {
    return undefined;
  }
  const previous = node.policy;
  change(node, { policy: policyAfter(node, op) });
  return previous ?? null;
}

function requireModeChoice(node: GraphNode, op: SetOp, kinds: NodeKindLookup): void {
  const kind = kinds.get(node.kind);
  if (op.mode === undefined || op.mode === null || kind === undefined) return;
  const { allowed } = modesOf(kind);
  if (allowed.includes(op.mode)) return;
  refuse(
    'not_allowed',
    `"${node.key}" (${node.kind}) cannot ${op.mode === 'fire_and_forget' ? 'send and continue' : 'wait for the result'}, it only offers: ${allowed.join(', ')}`,
  );
}

function nodeBack(node: GraphNode, op: SetOp, kinds: NodeKindLookup): Partial<SetOp> {
  requireModeChoice(node, op, kinds);
  return {
    policy: policyBack(node, op),
    outputs: edit(
      op.outputs,
      () => node.outputs,
      (outputs) => {
        change(node, { outputs });
      },
    ),
  };
}

function specificBack(entry: Entry, op: SetOp, kinds: NodeKindLookup): Partial<SetOp> {
  if (entry.kind === 'node') return nodeBack(entry.node, op, kinds);
  if (
    op.policy !== undefined ||
    op.mode !== undefined ||
    op.timeout !== undefined ||
    op.outputs !== undefined
  ) {
    refuse('not_allowed', 'a trigger has no policy, run mode, timeout or structured outputs');
  }
  return {};
}

export function applySet(program: ProgramV4, op: SetOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(next, op.key);
  const holder = entry.node;
  const keepEmpty = holder.ports !== undefined;
  const merged = mergePorts(holder, op.ports);
  const back = compact({
    op: 'set' as const,
    key: op.key,
    ports: Object.keys(merged.restore).length === 0 ? undefined : merged.restore,
    ...commonBack(holder, op),
    ...specificBack(entry, op, env.kinds),
  });
  compact(holder);
  const inverse: PatchOp[] = [];
  if (merged.added.length > 0) {
    inverse.push({
      op: 'unset',
      key: op.key,
      ports: merged.added,
      ...(keepEmpty ? { keepEmpty } : {}),
    });
  }
  if (Object.keys(back).length > 2) inverse.push(back);
  return outcome(next, inverse);
}

export function applyUnset(program: ProgramV4, op: UnsetOp): Outcome {
  const next = structuredClone(program);
  const holder = entryOf(next, op.key);
  const ports = holder.node.ports ?? {};
  const restore: Record<string, PortValue> = {};
  for (const name of new Set(op.ports)) {
    const previous = ports[name];
    if (previous === undefined) refuse('unknown_port', `"${op.key}" has no port "${name}"`);
    restore[name] = previous;
    Reflect.deleteProperty(ports, name);
  }
  const keepEmpty = op.keepEmpty === true || holder.kind === 'trigger';
  if (Object.keys(ports).length === 0 && !keepEmpty) Reflect.deleteProperty(holder.node, 'ports');
  return outcome(next, [{ op: 'set', key: op.key, ports: restore }]);
}
