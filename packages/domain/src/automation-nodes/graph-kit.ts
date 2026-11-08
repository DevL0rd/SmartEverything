import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { GraphBranch, GraphCase, GraphCatch, GraphNode } from '../automation-v3/graph';
import type { SwitchMatch } from '../automation-v3/node';
import type { PortValue } from '../automation-v3/port-value';
import { execClassOf, isExecNode, type ExecClass } from './exec-ports';
import { STATIC_KIND_LOOKUP, type NodeKindLookup } from './kind-lookup';

export interface GraphPiece {
  readonly id: string;
  readonly key: string;
  readonly keys: readonly string[];
  readonly exec: boolean;
  readonly place: (site: GraphSite, taken: Set<string>) => readonly GraphNode[];
}

export interface GraphSite {
  readonly after: string | undefined;
  readonly cont: string | undefined;
}

export interface GraphLane {
  readonly nodes: readonly GraphPiece[];
}

export interface GraphRows {
  readonly scopes?: Readonly<Record<string, GraphLane>>;
  readonly branches?: readonly {
    readonly id: string;
    readonly when: PortValue;
    readonly scope: GraphLane;
  }[];
  readonly cases?: readonly {
    readonly id: string;
    readonly match: SwitchMatch;
    readonly scope: GraphLane;
  }[];
  readonly catches?: readonly {
    readonly id: string;
    readonly classes?: GraphCatch['classes'];
    readonly scope: GraphLane;
  }[];
}

export interface GraphExtra
  extends
    GraphRows,
    Partial<Pick<GraphNode, 'policy' | 'label' | 'note' | 'enabled' | 'pin' | 'outputs'>> {}

export interface GraphKit {
  readonly node: (
    key: string,
    kind: string,
    ports?: Readonly<Record<string, PortValue>>,
    extra?: GraphExtra,
  ) => GraphPiece;
  readonly when: (
    key: string,
    condition: PortValue,
    then: readonly GraphPiece[],
    otherwise?: readonly GraphPiece[],
  ) => GraphPiece;
  readonly attempt: (
    key: string,
    body: readonly GraphPiece[],
    classes: GraphCatch['classes'],
    recovery: readonly GraphPiece[],
  ) => GraphPiece;
}

interface Parts {
  readonly base: GraphNode;
  readonly rows: GraphRows;
  readonly kinds: NodeKindLookup;
}

interface Child {
  readonly lane: GraphLane;
  readonly cont: string | undefined;
}

interface Converted {
  readonly node: GraphNode;
  readonly children: readonly Child[];
  readonly tail?: GraphNode;
}

type Convert = (parts: Parts, site: GraphSite, taken: Set<string>) => Converted;

type Wires = Readonly<Record<string, string | undefined>>;

type Lanes = readonly (readonly [string, GraphLane])[];

const TIMED_OUT = 'timedOut';
const ID_PREFIX = 'automation-graph:';

function structuralId(owner: string, role: string): string {
  const hex = bytesToHex(sha256(utf8ToBytes(`${ID_PREFIX}${owner}:${role}`))).slice(0, 32);
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function freeKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${String(suffix)}`)) suffix += 1;
  return `${base}_${String(suffix)}`;
}

function wired(wires: Wires): Pick<GraphNode, 'to'> {
  const found = Object.entries(wires).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return found.length === 0 ? {} : { to: Object.fromEntries(found) };
}

function rowTo(target: string | undefined): { to?: string } {
  return target === undefined ? {} : { to: target };
}

function entryOf(lane: GraphLane | undefined, fallback: string | undefined): string | undefined {
  return lane?.nodes.find((piece) => piece.exec)?.key ?? fallback;
}

function lanesOf(rows: GraphRows): Lanes {
  return Object.entries(rows.scopes ?? {});
}

function laneWires(lanes: Lanes, fallback?: string): Wires {
  return Object.fromEntries(lanes.map(([name, lane]) => [name, entryOf(lane, fallback)]));
}

function noChild(lane: GraphLane): Child {
  return { lane, cont: undefined };
}

export function graphPlace(
  pieces: readonly GraphPiece[],
  cont: string | undefined,
  taken: Set<string>,
): GraphNode[] {
  const execKeys = pieces.filter((piece) => piece.exec).map((piece) => piece.key);
  const placed: GraphNode[] = [];
  let position = 0;
  for (const piece of pieces) {
    if (piece.exec) position += 1;
    const after = piece.exec ? (execKeys[position] ?? cont) : undefined;
    placed.push(...piece.place({ after, cont }, taken));
  }
  return placed;
}

const convertPlain: Convert = ({ base }) => ({ node: base, children: [] });

const convertStep: Convert = ({ base, rows }, site) => {
  const lanes = lanesOf(rows);
  return {
    node: { ...base, ...wired({ next: site.after, ...laneWires(lanes) }) },
    children: lanes.map(([, lane]) => noChild(lane)),
  };
};

const convertOwner: Convert = (parts, site, taken) => {
  const stepped = convertStep(parts, site, taken);
  const catches = parts.rows.catches;
  if (catches === undefined) return stepped;
  const rows: GraphCatch[] = catches.map((row) => ({
    id: row.id,
    ...(row.classes === undefined ? {} : { classes: row.classes }),
    ...rowTo(entryOf(row.scope, undefined)),
  }));
  return {
    node: { ...stepped.node, catches: rows },
    children: [...stepped.children, ...catches.map((row) => noChild(row.scope))],
  };
};

function fallbackChildren(lane: GraphLane | undefined, site: GraphSite): readonly Child[] {
  return lane === undefined ? [] : [{ lane, cont: site.after }];
}

const convertIf: Convert = ({ base, rows }, site) => {
  const given = rows.branches ?? [];
  const fallback = rows.scopes?.['else'];
  const branches: GraphBranch[] = given.map((row) => ({
    id: row.id,
    when: row.when,
    ...rowTo(entryOf(row.scope, site.after)),
  }));
  return {
    node: {
      ...base,
      ...(branches.length === 0 ? {} : { branches }),
      ...wired({ else: entryOf(fallback, site.after) }),
    },
    children: [
      ...given.map((row) => ({ lane: row.scope, cont: site.after })),
      ...fallbackChildren(fallback, site),
    ],
  };
};

const convertSwitch: Convert = ({ base, rows }, site) => {
  const given = rows.cases;
  const fallback = rows.scopes?.['default'];
  const cases: GraphCase[] | undefined = given?.map((row) => ({
    id: row.id,
    match: row.match,
    ...rowTo(entryOf(row.scope, site.after)),
  }));
  return {
    node: {
      ...base,
      ...(cases === undefined ? {} : { cases }),
      ...wired({ default: entryOf(fallback, site.after) }),
    },
    children: [
      ...(given ?? []).map((row) => ({ lane: row.scope, cont: site.after })),
      ...fallbackChildren(fallback, site),
    ],
  };
};

const convertGuard: Convert = ({ base }, site) => ({
  node: { ...base, ...wired({ next: site.after, otherwise: site.cont }) },
  children: [],
});

const convertMemory: Convert = ({ base, rows, kinds }, site) => {
  const exits = (kinds.get(base.kind)?.exits ?? []).slice(1).filter((exit) => exit !== TIMED_OUT);
  const lanes = exits.flatMap((exit) => {
    const lane = rows.scopes?.[exit];
    return lane === undefined ? [] : [[exit, lane] as const];
  });
  const wires = Object.fromEntries(
    exits.map((exit) => [exit, entryOf(rows.scopes?.[exit], site.cont)]),
  );
  return {
    node: { ...base, ...wired({ next: site.after, ...wires, ...laneWires(lanes, site.after) }) },
    children: lanes.map(([, lane]) => ({ lane, cont: site.after })),
  };
};

const DECISIONS: Readonly<Record<string, Convert>> = {
  'flow.if': convertIf,
  'flow.switch': convertSwitch,
  'flow.guard': convertGuard,
};

const convertDecision: Convert = (parts, site, taken) =>
  (DECISIONS[parts.base.kind] ?? convertMemory)(parts, site, taken);

const convertFork: Convert = ({ base, rows }, site, taken) => {
  const joinKey = freeKey(`${base.key}_join`, taken);
  taken.add(joinKey);
  const paths = lanesOf(rows);
  return {
    node: {
      ...base,
      paths: paths.map(([name, lane]) => ({ name, ...rowTo(entryOf(lane, joinKey)) })),
    },
    children: paths.map(([, lane]) => ({ lane, cont: joinKey })),
    tail: {
      id: structuralId(base.id, 'join'),
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

function nestedKeys(rows: GraphRows): readonly string[] {
  const lanes = [
    ...Object.values(rows.scopes ?? {}),
    ...(rows.branches ?? []).map((row) => row.scope),
    ...(rows.cases ?? []).map((row) => row.scope),
    ...(rows.catches ?? []).map((row) => row.scope),
  ];
  return lanes.flatMap((lane) => lane.nodes.flatMap((piece) => piece.keys));
}

function pieceOf(base: GraphNode, rows: GraphRows, kinds: NodeKindLookup): GraphPiece {
  const exec = isExecNode(base.kind, kinds);
  const place: GraphPiece['place'] = (site, taken) => {
    if (!exec) return [base];
    const done = CONVERT[execClassOf(base.kind, kinds)]({ base, rows, kinds }, site, taken);
    const nested = done.children.flatMap((child) =>
      graphPlace(child.lane.nodes, child.cont, taken),
    );
    return [done.node, ...nested, ...(done.tail === undefined ? [] : [done.tail])];
  };
  return { id: base.id, key: base.key, keys: [base.key, ...nestedKeys(rows)], exec, place };
}

export function graphKitOf(nextId: () => string, kinds: NodeKindLookup): GraphKit {
  const node: GraphKit['node'] = (key, kind, ports, extra = {}) => {
    const { scopes, branches, cases, catches, ...plain } = extra;
    const base: GraphNode = {
      id: nextId(),
      key,
      kind,
      ...(ports === undefined ? {} : { ports: { ...ports } }),
      ...plain,
    };
    return pieceOf(
      base,
      {
        ...(scopes === undefined ? {} : { scopes }),
        ...(branches === undefined ? {} : { branches }),
        ...(cases === undefined ? {} : { cases }),
        ...(catches === undefined ? {} : { catches }),
      },
      kinds,
    );
  };
  const when: GraphKit['when'] = (key, condition, then, otherwise) => {
    const row = { id: nextId(), when: condition, scope: { nodes: then } };
    return node(key, 'flow.if', undefined, {
      branches: [row],
      ...(otherwise === undefined ? {} : { scopes: { else: { nodes: otherwise } } }),
    });
  };
  const attempt: GraphKit['attempt'] = (key, body, classes, recovery) => {
    const row = {
      id: nextId(),
      ...(classes === undefined ? {} : { classes: [...classes] }),
      scope: { nodes: recovery },
    };
    return node(key, 'flow.try', undefined, { scopes: { try: { nodes: body } }, catches: [row] });
  };
  return { node, when, attempt };
}

export function graphKit(group: number): GraphKit {
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    const tail = counter.toString(16).padStart(12, '0');
    return `b0000000-${group.toString(16).padStart(4, '0')}-4000-8000-${tail}`;
  };
  return graphKitOf(nextId, STATIC_KIND_LOOKUP);
}

export function graphNodesOf(
  body: readonly GraphPiece[],
  reserved: readonly string[] = [],
): GraphNode[] {
  const taken = new Set([...body.flatMap((piece) => piece.keys), ...reserved]);
  const key = freeKey('start', taken);
  taken.add(key);
  const start: GraphNode = {
    id: structuralId(body[0]?.id ?? 'program', 'start'),
    key,
    kind: 'flow.start',
    ...wired({ next: entryOf({ nodes: body }, undefined) }),
  };
  return [start, ...graphPlace(body, undefined, taken)];
}
