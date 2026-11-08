import {
  execClassOf,
  isExecNode,
  type ExecClass,
  type FlowNode,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
  type Scope,
} from '@smarteverything/domain';
import { indexProgram } from '../program/lookup';
import type { Program } from '../program/walk';
import { graphKey, graphNodeId } from './graph-ids';

export type UnstructureRefusalCode = 'flow_sequence';

export class UnstructureRefusal extends Error {
  override readonly name = 'UnstructureRefusal';

  constructor(
    readonly code: UnstructureRefusalCode,
    readonly key: string,
    readonly nodeId: string,
  ) {
    super(`${key} is a flow.sequence, which a graph has no place for, so it cannot be converted.`);
  }
}

interface Ctx {
  readonly kinds: NodeKindLookup;
  readonly nodes: GraphNode[];
  readonly taken: Set<string>;
}

interface Site {
  readonly after: string | undefined;
  readonly cont: string | undefined;
}

interface Child {
  readonly scope: Scope;
  readonly cont: string | undefined;
}

interface Converted {
  readonly node: GraphNode;
  readonly children: readonly Child[];
  readonly tail?: GraphNode;
}

type Convert = (ctx: Ctx, node: FlowNode, site: Site) => Converted;

type Wires = Readonly<Record<string, string | undefined>>;

const PROGRAM_OWNER = 'program';
const TIMED_OUT = 'timedOut';

function wired(wires: Wires): Pick<GraphNode, 'to'> {
  const found = Object.entries(wires).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return found.length === 0 ? {} : { to: Object.fromEntries(found) };
}

function rowTo(target: string | undefined): { to?: string } {
  return target === undefined ? {} : { to: target };
}

function entryOf(
  kinds: NodeKindLookup,
  scope: Scope | undefined,
  fallback: string | undefined,
): string | undefined {
  return scope?.nodes.find((node) => isExecNode(node.kind, kinds))?.key ?? fallback;
}

function graphBase(node: FlowNode): GraphNode {
  const { branches: _branches, cases: _cases, catches: _catches, scopes: _scopes, ...rest } = node;
  return rest;
}

function lanesOf(node: FlowNode): readonly (readonly [string, Scope])[] {
  return Object.entries(node.scopes ?? {});
}

function laneWires(
  kinds: NodeKindLookup,
  lanes: readonly (readonly [string, Scope])[],
  fallback?: string,
): Wires {
  return Object.fromEntries(lanes.map(([name, scope]) => [name, entryOf(kinds, scope, fallback)]));
}

const convertPlain: Convert = (_ctx, node) => ({ node: graphBase(node), children: [] });

const convertStep: Convert = (ctx, node, site) => {
  const lanes = lanesOf(node);
  return {
    node: { ...graphBase(node), ...wired({ next: site.after, ...laneWires(ctx.kinds, lanes) }) },
    children: lanes.map(([, scope]) => ({ scope, cont: undefined })),
  };
};

const convertOwner: Convert = (ctx, node, site) => {
  const base = convertStep(ctx, node, site);
  if (node.catches === undefined) return base;
  const rows = node.catches.map((row) => ({
    id: row.id,
    ...(row.classes === undefined ? {} : { classes: row.classes }),
    ...rowTo(entryOf(ctx.kinds, row.scope, undefined)),
  }));
  return {
    node: { ...base.node, catches: rows },
    children: [
      ...base.children,
      ...node.catches.map((row) => ({ scope: row.scope, cont: undefined })),
    ],
  };
};

function fallbackChildren(scope: Scope | undefined, site: Site): readonly Child[] {
  return scope === undefined ? [] : [{ scope, cont: site.after }];
}

const convertIf: Convert = (ctx, node, site) => {
  const rows = node.branches ?? [];
  const fallback = node.scopes?.['else'];
  const branches = rows.map((row) => ({
    id: row.id,
    when: row.when,
    ...rowTo(entryOf(ctx.kinds, row.scope, site.after)),
  }));
  return {
    node: {
      ...graphBase(node),
      ...(branches.length === 0 ? {} : { branches }),
      ...wired({ else: entryOf(ctx.kinds, fallback, site.after) }),
    },
    children: [
      ...rows.map((row) => ({ scope: row.scope, cont: site.after })),
      ...fallbackChildren(fallback, site),
    ],
  };
};

const convertSwitch: Convert = (ctx, node, site) => {
  const fallback = node.scopes?.['default'];
  const cases = node.cases?.map((row) => ({
    id: row.id,
    match: row.match,
    ...rowTo(entryOf(ctx.kinds, row.scope, site.after)),
  }));
  return {
    node: {
      ...graphBase(node),
      ...(cases === undefined ? {} : { cases }),
      ...wired({ default: entryOf(ctx.kinds, fallback, site.after) }),
    },
    children: [
      ...(node.cases ?? []).map((row) => ({ scope: row.scope, cont: site.after })),
      ...fallbackChildren(fallback, site),
    ],
  };
};

const convertGuard: Convert = (_ctx, node, site) => ({
  node: { ...graphBase(node), ...wired({ next: site.after, otherwise: site.cont }) },
  children: [],
});

const convertMemory: Convert = (ctx, node, site) => {
  const exits = (ctx.kinds.get(node.kind)?.exits ?? [])
    .slice(1)
    .filter((exit) => exit !== TIMED_OUT);
  const lanes = exits.flatMap((exit) => {
    const scope = node.scopes?.[exit];
    return scope === undefined ? [] : [[exit, scope] as const];
  });
  const wires = Object.fromEntries(
    exits.map((exit) => [exit, entryOf(ctx.kinds, node.scopes?.[exit], site.cont)]),
  );
  const lanesWired = laneWires(ctx.kinds, lanes, site.after);
  return {
    node: { ...graphBase(node), ...wired({ next: site.after, ...wires, ...lanesWired }) },
    children: lanes.map(([, scope]) => ({ scope, cont: site.after })),
  };
};

const DECISIONS: Readonly<Record<string, Convert>> = {
  'flow.if': convertIf,
  'flow.switch': convertSwitch,
  'flow.guard': convertGuard,
};

const convertDecision: Convert = (ctx, node, site) =>
  (DECISIONS[node.kind] ?? convertMemory)(ctx, node, site);

const convertFork: Convert = (ctx, node, site) => {
  const joinKey = graphKey(`${node.key}_join`, ctx.taken);
  ctx.taken.add(joinKey);
  const paths = lanesOf(node);
  return {
    node: {
      ...graphBase(node),
      paths: paths.map(([name, scope]) => ({ name, ...rowTo(entryOf(ctx.kinds, scope, joinKey)) })),
    },
    children: paths.map(([, scope]) => ({ scope, cont: joinKey })),
    tail: {
      id: graphNodeId(node.id, 'join'),
      key: joinKey,
      kind: 'flow.join',
      ...wired({ next: site.after }),
    },
  };
};

const CONVERT: Readonly<Record<ExecClass, Convert>> = {
  start: convertPlain,
  failure: convertPlain,
  join: convertPlain,
  value: convertPlain,
  terminal: convertPlain,
  step: convertStep,
  owner: convertOwner,
  decision: convertDecision,
  fork: convertFork,
};

function emitScope(ctx: Ctx, nodes: readonly FlowNode[], cont: string | undefined): void {
  const execKeys = nodes.filter((node) => isExecNode(node.kind, ctx.kinds)).map((node) => node.key);
  let position = 0;
  for (const node of nodes) {
    if (!isExecNode(node.kind, ctx.kinds)) {
      ctx.nodes.push(graphBase(node));
      continue;
    }
    position += 1;
    const site = { after: execKeys[position] ?? cont, cont };
    const converted = CONVERT[execClassOf(node.kind, ctx.kinds)](ctx, node, site);
    ctx.nodes.push(converted.node);
    for (const child of converted.children) emitScope(ctx, child.scope.nodes, child.cont);
    if (converted.tail !== undefined) ctx.nodes.push(converted.tail);
  }
}

function refuseSequences(nodes: readonly { readonly node: FlowNode }[]): void {
  const found = nodes.find((entry) => entry.node.kind === 'flow.sequence');
  if (found !== undefined) {
    throw new UnstructureRefusal('flow_sequence', found.node.key, found.node.id);
  }
}

interface Naming {
  readonly kinds: NodeKindLookup;
  readonly taken: Set<string>;
}

function rootNode({ kinds, taken }: Naming, scope: Scope, kind: string, role: string): GraphNode {
  const key = graphKey(role, taken);
  taken.add(key);
  return {
    id: graphNodeId(scope.nodes[0]?.id ?? PROGRAM_OWNER, role),
    key,
    kind,
    ...wired({ next: entryOf(kinds, scope, undefined) }),
  };
}

function programOf(tree: Program, nodes: GraphNode[]): ProgramV4 {
  if (tree.kind === 'function') {
    const { body: _body, version: _version, ...rest } = tree;
    return { ...rest, version: 4, nodes };
  }
  const { body: _body, onFailure: _failure, version: _version, ...rest } = tree;
  return { ...rest, version: 4, nodes };
}

export function unstructure(tree: Program, kinds: NodeKindLookup): ProgramV4 {
  const index = indexProgram(tree);
  refuseSequences(index.nodes);
  const taken = new Set(index.byKey.keys());
  const failure = tree.kind === 'automation' ? tree.onFailure : undefined;
  const naming: Naming = { kinds, taken };
  const roots = [
    rootNode(naming, tree.body, 'flow.start', 'start'),
    ...(failure === undefined ? [] : [rootNode(naming, failure, 'flow.on_failure', 'failure')]),
  ];
  const ctx: Ctx = { kinds, nodes: [...roots], taken };
  emitScope(ctx, tree.body.nodes, undefined);
  if (failure !== undefined) emitScope(ctx, failure.nodes, undefined);
  return programOf(tree, ctx.nodes);
}
