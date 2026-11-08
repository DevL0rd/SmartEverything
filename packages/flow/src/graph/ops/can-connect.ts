import {
  execClassOf,
  isExecNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import { nodeName } from '../problem-types';
import {
  execGraphOf,
  laneRegionId,
  membershipOf,
  outputsOf,
  type ExecGraph,
  type Membership,
  type Region,
} from '../regions';
import { setTarget } from './wires';

export type ConnectRefusal =
  | 'unknown_key'
  | 'unknown_port'
  | 'circle'
  | 'into_start'
  | 'across_region'
  | 'between_paths'
  | 'value_to_exec'
  | 'join_mismatch';

export type CanConnect =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ConnectRefusal; readonly message: string };

function no(reason: ConnectRefusal, message: string): CanConnect {
  return { ok: false, reason, message };
}

function reaches(graph: ExecGraph, start: string, goal: string): boolean {
  const seen = new Set<string>();
  const pending = [start];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (key === goal) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const out of outputsOf(graph, key)) {
      if (out.target !== undefined) pending.push(out.target);
    }
  }
  return false;
}

function isRegionProblem(code: string): boolean {
  return code === 'crosses_region' || code === 'join_mismatch';
}

function signature(problem: { code: string; key?: string | undefined }): string {
  return `${problem.code}|${problem.key ?? ''}`;
}

function sourceRegion(
  graph: ExecGraph,
  membership: Membership,
  from: string,
  port: string,
): string | undefined {
  const node = graph.byKey.get(from);
  const out = outputsOf(graph, from).find((candidate) => candidate.port === port);
  if (node === undefined) return undefined;
  if (out?.role === 'lane') return laneRegionId(from, port);
  const execClass = execClassOf(node.kind, graph.kinds);
  if (execClass === 'start') return 'body';
  if (execClass === 'failure') return 'failure';
  return membership.regionOf.get(from);
}

function isAncestor(membership: Membership, ancestor: Region, region: Region): boolean {
  let cursor = region.parent === undefined ? undefined : membership.regions.get(region.parent);
  while (cursor !== undefined) {
    if (cursor.id === ancestor.id) return true;
    cursor = cursor.parent === undefined ? undefined : membership.regions.get(cursor.parent);
  }
  return false;
}

function ownerName(graph: ExecGraph, region: Region): string {
  const owner = region.owner === undefined ? undefined : graph.byKey.get(region.owner);
  return owner === undefined ? 'its owner' : nodeName(owner, graph.kinds);
}

interface Where {
  readonly graph: ExecGraph;
  readonly membership: Membership;
}

function regionRefusal(
  where: Where,
  fromRegion: Region | undefined,
  toRegion: Region | undefined,
  fallback: string,
): CanConnect {
  if (fromRegion === undefined || toRegion === undefined) return no('across_region', fallback);
  if (
    fromRegion.kind === 'path' &&
    toRegion.kind === 'path' &&
    fromRegion.owner === toRegion.owner
  ) {
    return no(
      'between_paths',
      'Steps in different paths of a Do together cannot lead to each other.',
    );
  }
  if (isAncestor(where.membership, toRegion, fromRegion)) {
    return no(
      'across_region',
      `Steps inside ${ownerName(where.graph, fromRegion)} cannot lead outside it.`,
    );
  }
  return no(
    'across_region',
    `Only steps inside ${ownerName(where.graph, toRegion)} can lead here.`,
  );
}

export interface Link {
  readonly from: string;
  readonly port: string;
  readonly to: string;
}

function regionCheck(program: ProgramV4, link: Link, kinds: NodeKindLookup): CanConnect {
  const { from, port, to } = link;
  const graph = execGraphOf(program, kinds);
  const before = membershipOf(graph);
  const next = structuredClone(program);
  const holder = next.nodes.find((node) => node.key === from);
  if (holder === undefined) return { ok: true };
  setTarget(holder, port, to);
  const known = new Set(before.problems.map(signature));
  const fresh = membershipOf(execGraphOf(next, kinds)).problems.find(
    (problem) => isRegionProblem(problem.code) && !known.has(signature(problem)),
  );
  if (fresh === undefined) return { ok: true };
  if (fresh.code === 'join_mismatch') return no('join_mismatch', fresh.message);
  const fromId = sourceRegion(graph, before, from, port);
  const toId = before.regionOf.get(to);
  return regionRefusal(
    { graph, membership: before },
    fromId === undefined ? undefined : before.regions.get(fromId),
    toId === undefined ? undefined : before.regions.get(toId),
    fresh.message,
  );
}

export function canConnect(program: ProgramV4, link: Link, kinds: NodeKindLookup): CanConnect {
  const { from, port, to } = link;
  const source = program.nodes.find((node) => node.key === from);
  const target = program.nodes.find((node) => node.key === to);
  if (source === undefined) return no('unknown_key', `There is no step "${from}".`);
  if (target === undefined) return no('unknown_key', `There is no step "${to}".`);
  if (!isExecNode(source.kind, kinds)) {
    return no('value_to_exec', 'A value pin cannot lead to a step.');
  }
  if (!isExecNode(target.kind, kinds)) {
    return no('value_to_exec', 'A step cannot lead into a value card.');
  }
  const targetClass = execClassOf(target.kind, kinds);
  if (targetClass === 'start' || targetClass === 'failure') {
    return no('into_start', `Nothing can lead into ${nodeName(target, kinds)}.`);
  }
  const graph = execGraphOf(program, kinds);
  if (!outputsOf(graph, from).some((out) => out.port === port)) {
    return no('unknown_port', `${nodeName(source, kinds)} has no exit "${port}".`);
  }
  if (reaches(graph, to, from)) {
    return no('circle', 'This would make a circle. Use a loop to repeat.');
  }
  return regionCheck(program, link, kinds);
}
