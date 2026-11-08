import { appendTo } from '@smarteverything/domain';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import type { GraphSceneEdge, SceneProblem } from './scene-contract';
import { execOutHandle } from './handle-ids';

export interface SplitProblems {
  readonly onNodes: ReadonlyMap<string, readonly SceneProblem[]>;
  readonly onEdges: ReadonlyMap<string, GraphProblem>;
}

function sceneProblem(problem: GraphProblem): SceneProblem {
  return { code: problem.code, message: problem.message, fix: problem.fix };
}

function edgeKey(nodeId: string, handle: string): string {
  return `${nodeId}|${handle}`;
}

export function splitProblems(
  problems: readonly GraphProblem[],
  idByKey: ReadonlyMap<string, string>,
  execEdges: readonly GraphSceneEdge[],
): SplitProblems {
  const edgeIds = new Map(
    execEdges.map((edge) => [edgeKey(edge.source.nodeId, edge.source.handle), edge.id]),
  );
  const onNodes = new Map<string, SceneProblem[]>();
  const onEdges = new Map<string, GraphProblem>();
  for (const problem of problems) {
    const fromId = problem.wire === undefined ? undefined : idByKey.get(problem.wire.from);
    const edgeId =
      problem.wire === undefined || fromId === undefined
        ? undefined
        : edgeIds.get(edgeKey(fromId, execOutHandle(problem.wire.port)));
    if (edgeId !== undefined) {
      onEdges.set(edgeId, problem);
      continue;
    }
    const nodeId = fromId ?? problem.nodeId;
    if (nodeId === undefined) continue;
    appendTo(onNodes, nodeId, sceneProblem(problem));
  }
  return { onNodes, onEdges };
}

export function markProblemEdges(
  edges: readonly GraphSceneEdge[],
  onEdges: ReadonlyMap<string, GraphProblem>,
): readonly GraphSceneEdge[] {
  return edges.map((edge) => {
    const problem = onEdges.get(edge.id);
    return problem === undefined ? edge : { ...edge, state: 'problem', message: problem.message };
  });
}
