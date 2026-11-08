import {
  execClassOf,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import { entryOf, triggersOf, type Entry } from './identity';
import { describeReader, readersOf } from './refs';
import type { Detachment, OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, RemoveOp, SetOp } from './schema';
import { joinOfFork, forkOfJoin, outputsOfNode, setTarget, wiresInto, type WireRef } from './wires';

const FORK = 'flow.parallel';
const JOIN = 'flow.join';

export function detachAll(
  program: ProgramV4,
  doomed: ReadonlySet<string>,
  cascade: boolean,
): readonly Detachment[] {
  const outside = readersOf(program, doomed).filter(
    ({ site }) => site.owner === undefined || !doomed.has(site.owner),
  );
  const first = outside[0];
  if (first === undefined) return [];
  if (!cascade) {
    refuse('referenced', `${describeReader(first.site, first.reads)}; detach it or use cascade`);
  }
  return outside.map(({ site, reads }): Detachment => {
    if (site.detach === undefined || site.owner === undefined || site.slot.kind !== 'port') {
      return refuse('referenced', `${describeReader(site, reads)}, which cannot be detached`);
    }
    site.detach();
    return { owner: site.owner, where: 'port', port: site.slot.name, value: site.value, reads };
  });
}

export function restoreOps(detached: readonly Detachment[]): readonly PatchOp[] {
  const owners = new Map<string, SetOp>();
  for (const item of detached) {
    const restore: SetOp = owners.get(item.owner) ?? { op: 'set', key: item.owner };
    restore.ports = { ...restore.ports, [item.port]: item.value };
    owners.set(item.owner, restore);
  }
  return [...owners.values()];
}

interface Doomed {
  readonly front: GraphNode;
  readonly back: GraphNode | undefined;
}

function byKey(program: ProgramV4, key: string | undefined): GraphNode | undefined {
  return program.nodes.find((node) => node.key === key);
}

function doomedOf(program: ProgramV4, node: GraphNode, kinds: NodeKindLookup): Doomed {
  if (node.kind === FORK)
    return { front: node, back: byKey(program, joinOfFork(program, node.key, kinds)) };
  if (node.kind !== JOIN) return { front: node, back: undefined };
  const fork = byKey(program, forkOfJoin(program, node.key, kinds));
  return fork === undefined ? { front: node, back: undefined } : { front: fork, back: node };
}

function healTarget(
  doomed: Doomed,
  kinds: NodeKindLookup,
): { readonly target: string | undefined } | undefined {
  if (doomed.back !== undefined) {
    return { target: outputsOfNode(doomed.back, kinds).find((out) => out.role === 'next')?.target };
  }
  const { front } = doomed;
  const outputs = outputsOfNode(front, kinds);
  const nexts = outputs.filter((out) => out.role === 'next');
  const healable =
    execClassOf(front.kind, kinds) === 'step' &&
    nexts.length === 1 &&
    outputs.every((out) => out.role !== 'branch');
  return healable ? { target: nexts[0]?.target } : undefined;
}

function rewire(program: ProgramV4, wires: readonly WireRef[], target: string | undefined): void {
  for (const wire of wires) {
    const holder = byKey(program, wire.from);
    if (holder !== undefined) setTarget(holder, wire.port, target);
  }
}

function connects(wires: readonly WireRef[]): readonly PatchOp[] {
  return wires.map((wire) => ({ op: 'connect', from: wire.from, port: wire.port, to: wire.to }));
}

function restoreNodes(doomed: Doomed, backNext: string | undefined): readonly PatchOp[] {
  const { front, back } = doomed;
  if (back === undefined) return [{ op: 'add', node: front }];
  const joined: PatchOp = { op: 'add', node: front, join: { key: back.key, id: back.id } };
  return backNext === undefined
    ? [joined]
    : [joined, { op: 'connect', from: back.key, port: 'next', to: backNext }];
}

function removeTrigger(
  next: ProgramV4,
  entry: Extract<Entry, { kind: 'trigger' }>,
  op: RemoveOp,
): Outcome {
  const detached = detachAll(next, new Set([op.key]), op.cascade === true);
  triggersOf(next).splice(entry.index, 1);
  return outcome(next, [{ op: 'add', node: entry.node }, ...restoreOps(detached)], { detached });
}

export function applyRemove(program: ProgramV4, op: RemoveOp, env: OpEnv): Outcome {
  const { kinds } = env;
  const next = structuredClone(program);
  const entry = entryOf(next, op.key);
  if (entry.kind === 'trigger') return removeTrigger(next, entry, op);
  const doomed = doomedOf(next, entry.node, kinds);
  const keys = new Set(
    [doomed.front, doomed.back].flatMap((node) => (node === undefined ? [] : [node.key])),
  );
  const detached = detachAll(next, keys, op.cascade === true);
  const front = wiresInto(next, new Set([doomed.front.key]), kinds).filter(
    (wire) => !keys.has(wire.from),
  );
  const back = wiresInto(
    next,
    new Set(doomed.back === undefined ? [] : [doomed.back.key]),
    kinds,
  ).filter((wire) => !keys.has(wire.from));
  const heal = op.heal === true ? healTarget(doomed, kinds) : undefined;
  const backNext = doomed.back === undefined ? undefined : healTarget(doomed, kinds)?.target;
  const snapshot = structuredClone(doomed);
  rewire(next, front, heal?.target);
  rewire(next, back, undefined);
  next.nodes = next.nodes.filter((node) => !keys.has(node.key));
  const inverse = [
    ...restoreNodes(snapshot, backNext),
    ...connects(back),
    ...connects(front),
    ...restoreOps(detached),
  ];
  return outcome(next, inverse, { detached });
}
