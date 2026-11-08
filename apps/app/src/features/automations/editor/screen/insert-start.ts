import type { NodeKindLookup } from '@smarteverything/domain';
import { execClassOf, execPortsOf, type GraphNode, type ProgramV4 } from '@smarteverything/domain';
import type { DocumentState } from '../../model/editor/document-store';
import { FREE_POINT, type InsertPoint } from '../palette/armed-insert';
import { execPinOf } from '../palette/pin-filter';

type Subject = Pick<DocumentState, 'program' | 'selection'>;

function reachableFrom(
  program: ProgramV4,
  start: GraphNode,
  kinds: NodeKindLookup,
): readonly GraphNode[] {
  const byKey = new Map(program.nodes.map((node) => [node.key, node]));
  const seen = new Map<string, GraphNode>([[start.key, start]]);
  const queue = [start];
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    for (const out of execPortsOf(node.kind, node, kinds).outputs) {
      const next = out.target === undefined ? undefined : byKey.get(out.target);
      if (next === undefined || seen.has(next.key)) continue;
      seen.set(next.key, next);
      queue.push(next);
    }
  }
  return [...seen.values()];
}

function openEnds(
  program: ProgramV4,
  kinds: NodeKindLookup,
): readonly { readonly node: GraphNode; readonly port: string }[] {
  const start = program.nodes.find((node) => execClassOf(node.kind, kinds) === 'start');
  if (start === undefined) return [];
  return reachableFrom(program, start, kinds).flatMap((node) =>
    execPortsOf(node.kind, node, kinds)
      .outputs.filter((out) => out.role === 'next' && out.target === undefined)
      .map((out) => ({ node, port: out.port })),
  );
}

function pointAfter(
  program: ProgramV4,
  node: GraphNode,
  port: string,
  kinds: NodeKindLookup,
): InsertPoint {
  const pin = execPinOf(program, node.id, port, kinds);
  return pin === undefined ? FREE_POINT : { pin, at: null, filtered: false };
}

export function insertStartOf(state: Subject, kinds: NodeKindLookup): InsertPoint {
  const { program, selection } = state;
  const [only, ...rest] = selection.ids;
  const picked =
    only === undefined || rest.length > 0
      ? undefined
      : program.nodes.find((item) => item.id === only);
  if (picked !== undefined) {
    const exit = execPortsOf(picked.kind, picked, kinds).outputs.find((out) => out.role === 'next');
    return exit === undefined ? FREE_POINT : pointAfter(program, picked, exit.port, kinds);
  }
  const ends = openEnds(program, kinds);
  const [end] = ends;
  return end === undefined || ends.length > 1
    ? FREE_POINT
    : pointAfter(program, end.node, end.port, kinds);
}
