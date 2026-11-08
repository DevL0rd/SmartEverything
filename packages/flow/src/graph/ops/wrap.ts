import {
  execClassOf,
  isExecNode,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import { claimId, claimKey, nodeOf, takenOf, type Ids } from './identity';
import { guardFreeKeys } from './refs';
import type { Created, OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { PatchOp, WrapOp } from './schema';
import { change, compact } from './util';
import { outputsOfNode, setTarget, wiresOf, type WireRef } from './wires';

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
const FORK_KIND = 'flow.parallel';
const JOIN_KIND = 'flow.join';

interface Chain {
  readonly first: string;
  readonly members: ReadonlySet<string>;
  readonly entering: readonly WireRef[];
  readonly leaving: readonly WireRef[];
  readonly exit: string | undefined;
}

function chainOf(program: ProgramV4, keys: WrapOp['keys'], kinds: NodeKindLookup): Chain {
  const members = new Set(keys);
  if (members.size !== keys.length) refuse('not_allowed', 'every wrapped key is listed once');
  for (const key of keys) {
    const kind = nodeOf(program, key).kind;
    const execClass = execClassOf(kind, kinds);
    if (!isExecNode(kind, kinds) || execClass === 'start' || execClass === 'failure') {
      refuse('not_allowed', `"${key}" is not a step that can be wrapped`);
    }
  }
  const wires = wiresOf(program, kinds);
  const [first] = keys;
  const entering = wires.filter((wire) => members.has(wire.to) && !members.has(wire.from));
  const stray = entering.find((wire) => wire.to !== first);
  if (stray !== undefined) {
    refuse(
      'not_allowed',
      `the wrapped steps need one way in, but "${stray.from}" leads to "${stray.to}"`,
    );
  }
  const leaving = wires.filter((wire) => members.has(wire.from) && !members.has(wire.to));
  const exits = [...new Set(leaving.map((wire) => wire.to))];
  if (exits.length > 1) {
    refuse(
      'not_allowed',
      `the wrapped steps need at most one way out, but they lead to ${exits.join(' and ')}`,
    );
  }
  return { first, members, entering, leaving, exit: exits[0] };
}

function shell(op: WrapOp, key: string, id: string): GraphNode {
  return compact({
    id,
    key,
    kind: op.kind,
    ports: op.ports,
    policy: op.policy,
    label: op.label,
    note: op.note,
    enabled: op.enabled,
  });
}

function optionalTo(entries: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).flatMap(([port, target]) =>
      target === undefined ? [] : [[port, target]],
    ),
  );
}

function fillIf(container: GraphNode, op: WrapOp, chain: Chain, ids: Ids): void {
  if (op.when === undefined) refuse('not_allowed', 'wrapping in flow.if needs a "when" condition');
  const id = claimId(ids.taken, op.rowId, ids.env);
  change(container, {
    branches: [{ id, when: op.when, to: chain.first }],
    to: optionalTo({ else: chain.exit }),
  });
}

function fillFork(program: ProgramV4, container: GraphNode, chain: Chain, ids: Ids): GraphNode {
  const join: GraphNode = {
    id: claimId(ids.taken, undefined, ids.env),
    key: claimKey(ids.taken, undefined, JOIN_KIND),
    kind: JOIN_KIND,
    ...(chain.exit === undefined ? {} : { to: { next: chain.exit } }),
  };
  guardFreeKeys(program, [join.key]);
  change(container, {
    paths: [
      { name: 'path1', to: chain.first },
      { name: 'path2', to: join.key },
    ],
  });
  for (const wire of chain.leaving) setTarget(nodeOf(program, wire.from), wire.port, join.key);
  return join;
}

function cut(program: ProgramV4, chain: Chain): void {
  for (const wire of chain.leaving) setTarget(nodeOf(program, wire.from), wire.port, undefined);
}

function build(program: ProgramV4, op: WrapOp, chain: Chain, ids: Ids): readonly GraphNode[] {
  const key = claimKey(ids.taken, op.key, op.kind);
  guardFreeKeys(program, [key]);
  const container = shell(op, key, claimId(ids.taken, op.id, ids.env));
  if (op.kind !== IF_KIND && op.when !== undefined) {
    refuse('not_allowed', '"when" belongs to wrapping in flow.if only');
  }
  if (op.kind === IF_KIND) {
    fillIf(container, op, chain, ids);
    return [container];
  }
  if (op.kind === FORK_KIND) return [container, fillFork(program, container, chain, ids)];
  const lane = op.kind === TRY_KIND ? 'try' : LOOP_KINDS.has(op.kind) ? 'body' : undefined;
  if (lane === undefined) {
    return refuse(
      'not_allowed',
      `${op.kind} cannot wrap steps (use a loop, flow.try, flow.if or flow.parallel)`,
    );
  }
  change(container, { to: optionalTo({ [lane]: chain.first, next: chain.exit }) });
  cut(program, chain);
  return [container];
}

function connects(wires: readonly WireRef[]): readonly PatchOp[] {
  return wires.map((wire) => ({ op: 'connect', from: wire.from, port: wire.port, to: wire.to }));
}

function tailJoin(
  program: ProgramV4,
  last: string | undefined,
  join: GraphNode | undefined,
  kinds: NodeKindLookup,
): void {
  const tail = program.nodes.find((node) => node.key === last);
  if (tail === undefined || join === undefined) return;
  const open = outputsOfNode(tail, kinds).find(
    (out) => out.role === 'next' && out.target === undefined,
  );
  if (open !== undefined) setTarget(tail, open.port, join.key);
}

export function applyWrap(program: ProgramV4, op: WrapOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const chain = chainOf(next, op.keys, env.kinds);
  const built = build(next, op, chain, { taken: takenOf(next), env });
  const [container, join] = built;
  if (container === undefined) return refuse('not_allowed', 'nothing was built');
  if (chain.leaving.length === 0) tailJoin(next, op.keys[op.keys.length - 1], join, env.kinds);
  for (const wire of chain.entering) setTarget(nodeOf(next, wire.from), wire.port, container.key);
  next.nodes.push(...built);
  const created: Created[] = built.map((node) => ({ key: node.key, id: node.id }));
  const inverse: PatchOp[] = [
    { op: 'remove', key: container.key },
    ...connects(chain.entering.map((wire) => ({ ...wire, to: chain.first }))),
    ...connects(chain.leaving),
  ];
  return outcome(next, inverse, { created });
}
