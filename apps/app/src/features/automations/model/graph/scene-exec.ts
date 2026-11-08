import type { NodeKindLookup } from '@smarteverything/domain';
import {
  canRouteOnError,
  ERROR_EXIT_PORT,
  execClassOf,
  execPortsOf,
  type ExecOutput,
  type GraphNode,
} from '@smarteverything/domain';
import type { ExecGraph, Membership } from '@smarteverything/flow/graph/regions';
import { conditionHandle, execInHandle, execOutHandle } from './handle-ids';
import { valueWords, type PinContext } from './scene-pins';
import type { GraphSceneEdge, SceneCondition, SceneExecRow } from './scene-contract';
import { pathLabel } from './scene-titles';

export interface ExecFacts {
  readonly graph: ExecGraph;
  readonly membership: Membership;
  readonly pins: PinContext;
}

const TOP_LEVEL = new Set(['body', 'failure']);

const LOOP_RETURNS: Readonly<Record<string, string>> = {
  'flow.for_each': 'next item',
  'flow.repeat': 'next pass',
  'flow.for_range': 'next pass',
  'flow.while': 'next pass',
  'flow.do_until': 'next pass',
  'flow.forever': 'next pass',
  'flow.try': 'back to Try',
};

const CARRY_ON = 'carry on';

const PATH_PREFIX = 'path:';

function laneReturn(facts: ExecFacts, owner: string | undefined): string {
  const kind = owner === undefined ? undefined : facts.graph.byKey.get(owner)?.kind;
  return (kind === undefined ? undefined : LOOP_RETURNS[kind]) ?? CARRY_ON;
}

function endCapOf(facts: ExecFacts, node: GraphNode, out: ExecOutput): string | null {
  if (out.target !== undefined || out.role === 'lane') return null;
  const regionId = facts.membership.regionOf.get(node.key);
  const region = regionId === undefined ? undefined : facts.membership.regions.get(regionId);
  if (region === undefined) return null;
  if (TOP_LEVEL.has(region.kind)) return out.role === 'branch' ? 'End of run' : 'End';
  return out.role === 'branch' ? 'End of this part' : laneReturn(facts, region.owner);
}

function conditionOf(facts: ExecFacts, node: GraphNode, out: ExecOutput): SceneCondition | null {
  const id = out.port.startsWith('row:') ? out.port.slice('row:'.length) : undefined;
  const row = node.branches?.find((branch) => branch.id === id);
  if (row === undefined) return null;
  return {
    handle: conditionHandle('row', row.id),
    text: valueWords(row.when, undefined, facts.pins),
    wired: 'wire' in row.when,
  };
}

function rowOf(facts: ExecFacts, node: GraphNode, out: ExecOutput): SceneExecRow {
  return {
    handle: execOutHandle(out.port),
    port: out.port,
    role: out.role,
    label: out.port.startsWith(PATH_PREFIX) ? pathLabel(out.label) : out.label,
    wired: out.target !== undefined,
    endCap: endCapOf(facts, node, out),
    condition: conditionOf(facts, node, out),
  };
}

export function execRowsOf(
  facts: ExecFacts,
  node: GraphNode,
  kinds: NodeKindLookup,
): readonly SceneExecRow[] {
  return execPortsOf(node.kind, node, kinds).outputs.map((out) => rowOf(facts, node, out));
}

export const ERROR_EXIT_LABEL = 'If it fails';

export function latentErrorHandle(
  kind: string,
  rows: readonly SceneExecRow[],
  kinds: NodeKindLookup,
): string | null {
  if (!canRouteOnError(kind, kinds) || rows.some((row) => row.port === ERROR_EXIT_PORT))
    return null;
  return execOutHandle(ERROR_EXIT_PORT);
}

export function hasExecInput(node: GraphNode, automation: boolean, kinds: NodeKindLookup): boolean {
  const execClass = execClassOf(node.kind, kinds);
  return execClass === 'start' ? automation : execPortsOf(node.kind, node, kinds).input;
}

function execEdge(from: string, handle: string, to: string, fixed: boolean): GraphSceneEdge {
  return {
    id: `exec:${from}.${handle}>${to}`,
    kind: 'exec',
    source: { nodeId: from, handle },
    target: { nodeId: to, handle: execInHandle() },
    state: 'normal',
    fixed,
    type: null,
    message: null,
    lane: null,
  };
}

export function execEdgesOf(
  nodes: readonly GraphNode[],
  idOf: (key: string) => string | undefined,
  kinds: NodeKindLookup,
): readonly GraphSceneEdge[] {
  return nodes.flatMap((node) =>
    execPortsOf(node.kind, node, kinds).outputs.flatMap((out) => {
      const target = out.target === undefined ? undefined : idOf(out.target);
      return target === undefined
        ? []
        : [execEdge(node.id, execOutHandle(out.port), target, false)];
    }),
  );
}

export function triggerEdge(triggerId: string, startId: string): GraphSceneEdge {
  return execEdge(triggerId, execOutHandle('next'), startId, true);
}
