import type { NodeKindLookup } from '@smarteverything/domain';
import { execClassOf, execPortsOf, isExecNode, type ProgramV4 } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { forkOfJoin, wiresInto } from '@smarteverything/flow/graph/ops/wires';
import { nodeName, wireText } from '@smarteverything/flow/graph/problem-types';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { indexProgram, siblings, type ProgramIndex } from '@smarteverything/flow/program/lookup';
import { z } from 'zod';
import {
  holderById,
  nodeByKey,
  plural,
  refuse,
  type GraphDocument,
  type Holder,
  type Planned,
} from './intent-env';

export const DELETE_REQUEST = z.strictObject({
  ids: z.array(z.string().min(1)).min(1),
  mode: z.enum(['heal', 'owned']).optional(),
});

export type DeleteRequest = z.infer<typeof DELETE_REQUEST>;

export const REFUSED_STRUCTURAL = 'Start and On failure stay. Delete the steps after them instead.';
export const REFUSED_NOTHING = 'Those steps are no longer on the canvas.';
export const REFUSED_ONE = 'Pick one step to delete with everything it owns.';

interface Targets {
  readonly keys: readonly string[];
  readonly kept: readonly string[];
}

function targetKey(program: ProgramV4, holder: Holder, kinds: NodeKindLookup): string | undefined {
  const execClass = execClassOf(holder.kind, kinds);
  if (execClass === 'join') return forkOfJoin(program, holder.key, kinds) ?? holder.key;
  return execClass === 'start' || execClass === 'failure' ? undefined : holder.key;
}

function targetsOf(program: ProgramV4, ids: readonly string[], kinds: NodeKindLookup): Targets {
  const holders = ids.flatMap((id) => {
    const holder = holderById(program, id);
    return holder === undefined ? [] : [holder];
  });
  const keys = holders.flatMap((holder) => {
    const key = targetKey(program, holder, kinds);
    return key === undefined ? [] : [key];
  });
  const kept = holders.filter((holder) => targetKey(program, holder, kinds) === undefined);
  return { keys: [...new Set(keys)], kept: kept.map((holder) => nodeName(holder, kinds)) };
}

function leavesBranches(
  program: ProgramV4,
  keys: readonly string[],
  kinds: NodeKindLookup,
): boolean {
  return keys.some((key) => {
    const node = nodeByKey(program, key);
    if (node === undefined || execClassOf(node.kind, kinds) === 'step') return false;
    return execPortsOf(node.kind, node, kinds).outputs.some((out) => out.target !== undefined);
  });
}

function removal(key: string, heal: boolean): PatchOp {
  return heal
    ? { op: 'remove', key, heal: true, cascade: true }
    : { op: 'remove', key, cascade: true };
}

function summary(
  program: ProgramV4,
  targets: Targets,
  tail: string,
  kinds: NodeKindLookup,
): string {
  const [only] = targets.keys;
  const node = only === undefined ? undefined : nodeByKey(program, only);
  const what =
    targets.keys.length === 1 && node !== undefined
      ? nodeName(node, kinds)
      : plural(targets.keys.length, 'step', 'steps');
  const stays = targets.kept.length > 0 ? ` ${targets.kept.join(' and ')} stays.` : '';
  return `Deleted ${what}${tail}.${stays}`;
}

const LOOSE = '. Its branches stay as unconnected steps';

function healText(program: ProgramV4, keys: readonly string[], kinds: NodeKindLookup): string {
  const [key] = keys;
  const node = key === undefined || keys.length > 1 ? undefined : nodeByKey(program, key);
  const next = node?.to?.['next'];
  const target = next === undefined ? undefined : nodeByKey(program, next);
  if (key === undefined || target === undefined) return '';
  const sources = wiresInto(program, new Set([key]), kinds).flatMap((wire) => {
    const from = nodeByKey(program, wire.from);
    if (from === undefined) return [];
    return [wire.port === 'next' ? nodeName(from, kinds) : wireText(from, wire.port, kinds)];
  });
  if (sources.length === 0) return '';
  const verb = sources.length === 1 ? 'goes' : 'go';
  return `; ${sources.join(' and ')} now ${verb} to ${nodeName(target, kinds)}`;
}

function planHeal(doc: GraphDocument, ids: readonly string[], kinds: NodeKindLookup): Planned {
  const targets = targetsOf(doc.program, ids, kinds);
  if (targets.keys.length === 0) {
    return refuse(targets.kept.length > 0 ? REFUSED_STRUCTURAL : REFUSED_NOTHING);
  }
  return {
    ok: true,
    ops: targets.keys.map((key) => removal(key, true)),
    select: () => [],
    message: () => ({
      announcement: summary(
        doc.program,
        targets,
        leavesBranches(doc.program, targets.keys, kinds)
          ? LOOSE
          : healText(doc.program, targets.keys, kinds),
        kinds,
      ),
    }),
  };
}

function nextExecSibling(
  index: ProgramIndex,
  key: string,
  kinds: NodeKindLookup,
): string | undefined {
  const order = siblings(index, key);
  const at = order.findIndex((node) => node.key === key);
  return order.slice(at + 1).find((node) => isExecNode(node.kind, kinds))?.key;
}

function planOwned(
  doc: GraphDocument,
  key: string,
  targets: Targets,
  kinds: NodeKindLookup,
): Planned {
  const structured = structuredOf(doc.program, kinds);
  if (structured.kind === 'unstructured') {
    const count = plural(structured.problems.length, 'problem', 'problems');
    return refuse(`Fix ${count} before deleting a step with everything it owns.`);
  }
  const index = indexProgram(structured.tree);
  const owned = index.nodes
    .filter((entry) => entry.ancestors.includes(key) && isExecNode(entry.node.kind, kinds))
    .map((entry) => entry.node.key);
  const after = nextExecSibling(index, key, kinds);
  const inside = new Set([key, ...owned]);
  const incoming = wiresInto(doc.program, new Set([key]), kinds).filter(
    (wire) => !inside.has(wire.from),
  );
  const heal: readonly PatchOp[] =
    after === undefined
      ? []
      : incoming.map((wire) => ({ op: 'connect', from: wire.from, port: wire.port, to: after }));
  return {
    ok: true,
    ops: [...heal, removal(key, false), ...owned.map((owner) => removal(owner, false))],
    select: () => [],
    message: () => ({
      announcement: summary(
        doc.program,
        targets,
        ` and ${plural(owned.length, 'step', 'steps')} it owned`,
        kinds,
      ),
    }),
  };
}

export function planDelete(
  doc: GraphDocument,
  request: DeleteRequest,
  kinds: NodeKindLookup,
): Planned {
  if (request.mode !== 'owned') return planHeal(doc, request.ids, kinds);
  const targets = targetsOf(doc.program, request.ids, kinds);
  const [key] = targets.keys;
  if (key === undefined) {
    return refuse(targets.kept.length > 0 ? REFUSED_STRUCTURAL : REFUSED_NOTHING);
  }
  return targets.keys.length === 1 ? planOwned(doc, key, targets, kinds) : refuse(REFUSED_ONE);
}

export type DeleteEffect = 'stays' | 'loose' | 'heals';

export function deleteEffectOf(
  program: ProgramV4,
  id: string,
  kinds: NodeKindLookup,
): DeleteEffect {
  const targets = targetsOf(program, [id], kinds);
  if (targets.keys.length === 0) return 'stays';
  return leavesBranches(program, targets.keys, kinds) ? 'loose' : 'heals';
}
