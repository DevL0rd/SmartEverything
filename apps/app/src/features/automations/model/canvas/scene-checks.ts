import { parseScopePath } from '@smarteverything/flow/program/paths';
import { indexProgram, resolveScope } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import { NODE_REGISTRY } from '@smarteverything/domain';
import type { FlowNode } from '@smarteverything/domain';
import type { InsertPoint, Scene, SceneNode } from './contract';

export function ancestorsOf(scene: Scene, node: SceneNode): ReadonlySet<string> {
  const byId = new Map(scene.nodes.map((entry) => [entry.id, entry]));
  const chain = new Set<string>();
  let parent = node.parentId;
  while (parent !== null && !chain.has(parent)) {
    chain.add(parent);
    parent = byId.get(parent)?.parentId ?? null;
  }
  return chain;
}

function intersects(a: SceneNode, b: SceneNode): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function overlaps(scene: Scene): readonly string[] {
  const found: string[] = [];
  scene.nodes.forEach((a, index) => {
    const chainA = ancestorsOf(scene, a);
    for (const b of scene.nodes.slice(index + 1)) {
      const related = chainA.has(b.id) || ancestorsOf(scene, b).has(a.id);
      if (!related && intersects(a, b)) found.push(`${a.title} (${a.id}) x ${b.title} (${b.id})`);
    }
  });
  return found;
}

export function duplicateIds(scene: Scene): readonly string[] {
  const seen = new Set<string>();
  return scene.nodes.flatMap((node) => {
    const repeated = seen.has(node.id);
    seen.add(node.id);
    return repeated ? [node.id] : [];
  });
}

function isExec(kind: string | undefined): boolean {
  if (kind === undefined) return true;
  const cls = NODE_REGISTRY.get(kind)?.class;
  return cls !== 'pure' && cls !== 'read';
}

function placeProblems(nodes: readonly FlowNode[], point: InsertPoint): readonly string[] {
  const problems: string[] = [];
  if (point.index > nodes.length) problems.push(`${point.id}: index past the scope`);
  const upTo =
    point.before === null ? nodes.length : nodes.findIndex((node) => node.id === point.before);
  if (upTo < point.index) problems.push(`${point.id}: before is not after the index`);
  const between = nodes.slice(point.index, upTo);
  if (point.placement !== 'slot' && between.some((node) => isExec(node.kind))) {
    problems.push(`${point.id}: an exec step sits between the index and its anchor`);
  }
  if (point.placement === 'slot' && nodes.some((node) => isExec(node.kind))) {
    problems.push(`${point.id}: slot in a scope that has steps`);
  }
  return problems;
}

export function brokenInserts(program: Program, scene: Scene): readonly string[] {
  const index = indexProgram(program);
  return scene.insertPoints.flatMap((point) => {
    const path = parseScopePath(point.scope);
    const target = path === undefined ? undefined : resolveScope(index, path);
    return target === undefined
      ? [`${point.id}: scope does not resolve`]
      : placeProblems(target.nodes, point);
  });
}

export function brokenEdges(scene: Scene): readonly string[] {
  const ids = new Set(scene.nodes.map((node) => node.id));
  const seen = new Set<string>();
  return scene.edges.flatMap((edge) => {
    const issues: string[] = [];
    if (seen.has(edge.id)) issues.push(`${edge.id}: repeated`);
    seen.add(edge.id);
    if (!ids.has(edge.from.nodeId) || !ids.has(edge.to.nodeId)) issues.push(`${edge.id}: dangling`);
    return issues;
  });
}
