import {
  execClassOf,
  execPortsOf,
  isExecNode,
  kindLookupFrom,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import type { CheckContext } from '../check/check';
import { extractRegion, type ExtractOptions, type Extraction } from '../extract/extract';
import type { ExtractCode } from '../extract/result';
import { nodeName, wireText } from './problem-types';
import { execGraphOf, membershipOf } from './regions';
import { structuredOf } from './structured-of';

export type GraphExtractCode =
  ExtractCode | 'structure' | 'wire_in' | 'wire_out' | 'disconnected' | 'structural_node';

export interface GraphExtractRefusal {
  readonly ok: false;
  readonly code: GraphExtractCode;
  readonly reason: string;
  readonly suggestion: readonly string[];
}

export type GraphExtractResult = Extraction | GraphExtractRefusal;

interface Edge {
  readonly from: GraphNode;
  readonly port: string;
  readonly to: GraphNode;
}

interface Selection {
  readonly keys: ReadonlySet<string>;
  readonly nodes: ReadonlyMap<string, GraphNode>;
}

function refusal(code: GraphExtractCode, reason: string): GraphExtractRefusal {
  return { ok: false, code, reason, suggestion: [] };
}

function edgesOf(program: ProgramV4, kinds: NodeKindLookup): readonly Edge[] {
  const byKey = execGraphOf(program, kinds).byKey;
  return program.nodes
    .filter((node) => isExecNode(node.kind, kinds))
    .flatMap((from) =>
      execPortsOf(from.kind, from, kinds).outputs.flatMap((out) => {
        const to = out.target === undefined ? undefined : byKey.get(out.target);
        return to === undefined ? [] : [{ from, port: out.port, to }];
      }),
    );
}

function lookup(
  program: ProgramV4,
  keys: ReadonlySet<string>,
  kinds: NodeKindLookup,
): Selection | GraphExtractRefusal {
  const byKey = execGraphOf(program, kinds).byKey;
  const nodes = new Map<string, GraphNode>();
  for (const key of keys) {
    const node = byKey.get(key);
    if (node === undefined) {
      const isTrigger =
        program.kind === 'automation' && program.triggers.some((t) => t.key === key);
      return isTrigger
        ? refusal('trigger', `${key} is a trigger and triggers stay in the automation`)
        : refusal('unknown_key', `there is no node with the key ${key}`);
    }
    nodes.set(key, node);
  }
  return { keys, nodes };
}

function structuralRefusal(
  program: ProgramV4,
  selection: Selection,
  kinds: NodeKindLookup,
): GraphExtractRefusal | undefined {
  const joinOf = membershipOf(execGraphOf(program, kinds)).joinOf;
  const owned = new Set(
    [...joinOf].filter(([fork]) => selection.keys.has(fork)).map(([, join]) => join),
  );
  for (const node of selection.nodes.values()) {
    const execClass = execClassOf(node.kind, kinds);
    if (execClass === 'start' || execClass === 'failure') {
      return refusal('structural_node', `${nodeName(node, kinds)} stays in the automation`);
    }
    if (execClass === 'join' && !owned.has(node.key)) {
      return refusal('structural_node', `${nodeName(node, kinds)} goes with its Do together`);
    }
  }
  return undefined;
}

function components(
  selection: Selection,
  inside: readonly Edge[],
  kinds: NodeKindLookup,
): readonly GraphNode[][] {
  const exec = [...selection.nodes.values()].filter((node) => isExecNode(node.kind, kinds));
  const seen = new Set<string>();
  const groups: GraphNode[][] = [];
  for (const root of exec) {
    if (seen.has(root.key)) continue;
    const group: GraphNode[] = [];
    const queue = [root];
    seen.add(root.key);
    for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
      group.push(node);
      const near = inside.flatMap((e) =>
        e.from === node ? [e.to] : e.to === node ? [e.from] : [],
      );
      for (const other of near.filter((n) => !seen.has(n.key))) {
        seen.add(other.key);
        queue.push(other);
      }
    }
    groups.push(group);
  }
  return groups;
}

function disconnected(
  groups: readonly GraphNode[][],
  kinds: NodeKindLookup,
): GraphExtractRefusal | undefined {
  const [first, second] = groups;
  const a = first?.[0];
  const b = second?.[0];
  if (a === undefined || b === undefined) return undefined;
  return refusal(
    'disconnected',
    `${nodeName(a, kinds)} and ${nodeName(b, kinds)} are not wired together`,
  );
}

function entryRefusal(
  selection: Selection,
  inside: readonly Edge[],
  entries: readonly Edge[],
  kinds: NodeKindLookup,
): GraphExtractRefusal | undefined {
  const fed = new Set(inside.map((edge) => edge.to.key));
  const heads = [...selection.nodes.values()].filter(
    (n) => isExecNode(n.kind, kinds) && !fed.has(n.key),
  );
  const [head, other] = heads;
  if (head !== undefined && other !== undefined) {
    return refusal(
      'wire_in',
      `${nodeName(head, kinds)} and ${nodeName(other, kinds)} both start the selection`,
    );
  }
  const middle = entries.find((edge) => edge.to !== head);
  if (middle === undefined) return undefined;
  const message = `${nodeName(middle.to, kinds)} has a wire from outside the selection into the middle`;
  return refusal('wire_in', message);
}

function exitRefusal(
  exits: readonly Edge[],
  kinds: NodeKindLookup,
): GraphExtractRefusal | undefined {
  const [first] = exits;
  const other = exits.find((edge) => edge.to !== first?.to);
  if (first === undefined || other === undefined) return undefined;
  const text = `${wireText(first.from, first.port, kinds)} and ${wireText(other.from, other.port, kinds)}`;
  return refusal('wire_out', `${text} lead out of the selection to different steps`);
}

function wiresRefusal(
  program: ProgramV4,
  selection: Selection,
  kinds: NodeKindLookup,
): GraphExtractRefusal | undefined {
  const edges = edgesOf(program, kinds);
  const picked = (node: GraphNode): boolean => selection.keys.has(node.key);
  const inside = edges.filter((e) => picked(e.from) && picked(e.to));
  const entries = edges.filter((e) => !picked(e.from) && picked(e.to));
  const exits = edges.filter((e) => picked(e.from) && !picked(e.to));
  return (
    disconnected(components(selection, inside, kinds), kinds) ??
    entryRefusal(selection, inside, entries, kinds) ??
    exitRefusal(exits, kinds)
  );
}

function treeKeys(
  program: ProgramV4,
  keys: ReadonlySet<string>,
  kinds: NodeKindLookup,
): readonly string[] {
  const joins = new Set(membershipOf(execGraphOf(program, kinds)).joinOf.values());
  return [...keys].filter((key) => !joins.has(key));
}

export function extractFromGraph(
  program: ProgramV4,
  selection: readonly string[],
  ctx: CheckContext,
  options: ExtractOptions,
): GraphExtractResult {
  const kinds = kindLookupFrom(ctx.kinds);
  const keys = new Set(selection);
  const picked = lookup(program, keys, kinds);
  if ('ok' in picked) return picked;
  const refused = structuralRefusal(program, picked, kinds) ?? wiresRefusal(program, picked, kinds);
  if (refused !== undefined) return refused;
  const structured = structuredOf(program, kinds);
  if (structured.kind === 'unstructured') {
    const count = String(structured.problems.length);
    return refusal('structure', `Fix ${count} problems before making a Custom Node`);
  }
  return extractRegion(structured.tree, treeKeys(program, keys, kinds), ctx, options);
}
