import type { FlowNode, PortValue } from '@smarteverything/domain';
import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import type { Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, SetOp, UnsetOp } from './schema';
import { entryOf } from './target';
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

function nodeBack(node: FlowNode, op: SetOp): Partial<SetOp> {
  return {
    policy: edit(
      op.policy,
      () => node.policy,
      (policy) => {
        change(node, { policy });
      },
    ),
    outputs: edit(
      op.outputs,
      () => node.outputs,
      (outputs) => {
        change(node, { outputs });
      },
    ),
  };
}

function triggerBack(op: SetOp): Partial<SetOp> {
  if (op.policy !== undefined || op.outputs !== undefined) {
    refuse('not_allowed', 'a trigger has no policy or structured outputs');
  }
  return {};
}

export function applySet(program: Program, op: SetOp): Outcome {
  const next = structuredClone(program);
  const entry = entryOf(indexProgram(next), op.key);
  const holder = entry.node;
  const keepEmpty = holder.ports !== undefined;
  const merged = mergePorts(holder, op.ports);
  const specific = entry.kind === 'trigger' ? triggerBack(op) : nodeBack(entry.node, op);
  const back = compact({
    op: 'set' as const,
    key: op.key,
    ports: Object.keys(merged.restore).length === 0 ? undefined : merged.restore,
    ...commonBack(holder, op),
    ...specific,
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

export function applyUnset(program: Program, op: UnsetOp): Outcome {
  const next = structuredClone(program);
  const holder = entryOf(indexProgram(next), op.key);
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
