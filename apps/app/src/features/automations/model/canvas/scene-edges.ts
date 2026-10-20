import type { SceneEdge } from './contract';
import type { Tree } from './tree';
import type { Item, Lane } from './tree-env';

export interface ExecEdges {
  readonly edges: readonly SceneEdge[];
  readonly entering: ReadonlyMap<string, string>;
}

function execEdge(from: string, to: string, port: string): SceneEdge {
  return {
    id: `exec:${from}.${port}>${to}`,
    kind: 'exec',
    from: { nodeId: from, port },
    to: { nodeId: to, port: 'in' },
    type: null,
  };
}

function execItems(lane: Lane): readonly Item[] {
  return lane.items.filter((item) => item.exec);
}

function laneEdges(lane: Lane, sources: readonly string[], port: string): readonly SceneEdge[] {
  const items = execItems(lane);
  const first = items[0]?.draft.id ?? lane.slot?.id;
  const edges: SceneEdge[] = [];
  if (first !== undefined) edges.push(...sources.map((source) => execEdge(source, first, port)));
  items.forEach((item, index) => {
    const next = items[index + 1];
    if (next !== undefined) edges.push(execEdge(item.draft.id, next.draft.id, 'next'));
    for (const child of item.lanes) {
      edges.push(...laneEdges(child, child.draft === null ? [] : [child.draft.id], 'start'));
    }
  });
  return edges;
}

function triggerSources(tree: Tree, compact: boolean): readonly string[] {
  if (compact && tree.group !== null) return [tree.group.id];
  return tree.triggers.map((trigger) => trigger.draft.id);
}

function headSources(tree: Tree, compact: boolean): readonly string[] {
  if (tree.inputs !== null) return [tree.inputs.id];
  if (tree.admit !== null) return [tree.admit.id];
  return triggerSources(tree, compact);
}

function admitEdges(tree: Tree, compact: boolean): readonly SceneEdge[] {
  const admit = tree.admit;
  if (admit === null) return [];
  return triggerSources(tree, compact).map((source) => execEdge(source, admit.id, 'next'));
}

function failureEdges(failure: Lane | null): readonly SceneEdge[] {
  const draft = failure?.draft ?? null;
  return failure === null || draft === null ? [] : laneEdges(failure, [draft.id], 'start');
}

export function execEdgesOf(tree: Tree, compact: boolean): ExecEdges {
  const failure = tree.failure;
  const edges = [
    ...admitEdges(tree, compact),
    ...laneEdges(tree.body, headSources(tree, compact), 'next'),
    ...failureEdges(failure),
  ];
  const entering = new Map<string, string>();
  for (const edge of edges) {
    if (!entering.has(edge.to.nodeId)) entering.set(edge.to.nodeId, edge.id);
  }
  return { edges, entering };
}
