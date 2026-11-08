import type { GraphNode, PortValue, ProgramV4, TriggerNode } from '@smarteverything/domain';
import { conditionHandle, valueInHandle, valueOutHandle } from './handle-ids';
import type { EdgeEnd, GraphSceneEdge } from './scene-contract';

export interface ValueRequest {
  readonly target: EdgeEnd;
  readonly value: PortValue;
}

export type SourceOf = (key: string) => string | undefined;

export type TypeOf = (nodeId: string, port: string) => string | null;

const ADMIT_HANDLE = valueInHandle('admit');

function portRequests(node: GraphNode | TriggerNode): readonly ValueRequest[] {
  return Object.entries(node.ports ?? {}).map(([name, value]) => ({
    target: { nodeId: node.id, handle: valueInHandle(name) },
    value,
  }));
}

function rowRequests(node: GraphNode): readonly ValueRequest[] {
  return (node.branches ?? []).map((row) => ({
    target: { nodeId: node.id, handle: conditionHandle('row', row.id) },
    value: row.when,
  }));
}

export function requestsOf(
  program: ProgramV4,
  startId: string | undefined,
): readonly ValueRequest[] {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  const admit =
    program.kind === 'automation' && program.admit !== undefined && startId !== undefined
      ? [{ target: { nodeId: startId, handle: ADMIT_HANDLE }, value: program.admit }]
      : [];
  return [
    ...triggers.flatMap(portRequests),
    ...admit,
    ...program.nodes.flatMap((node) => [...portRequests(node), ...rowRequests(node)]),
  ];
}

interface Sourced {
  readonly nodeId: string;
  readonly port: string;
}

function sourcedOf(value: PortValue, sourceOf: SourceOf): Sourced | undefined {
  if (!('wire' in value)) return undefined;
  const nodeId = sourceOf(value.wire.from);
  return nodeId === undefined ? undefined : { nodeId, port: value.wire.port };
}

export function referencedPorts(
  requests: readonly ValueRequest[],
  sourceOf: SourceOf,
): ReadonlyMap<string, ReadonlySet<string>> {
  const found = new Map<string, Set<string>>();
  for (const { value } of requests) {
    const source = sourcedOf(value, sourceOf);
    if (source === undefined) continue;
    const ports = found.get(source.nodeId) ?? new Set<string>();
    ports.add(source.port);
    found.set(source.nodeId, ports);
  }
  return found;
}

function valueEdge(request: ValueRequest, source: Sourced, typeOf: TypeOf): GraphSceneEdge {
  const handle = valueOutHandle(source.port);
  const { target } = request;
  return {
    id: `value:${source.nodeId}.${handle}>${target.nodeId}.${target.handle}`,
    kind: 'value',
    source: { nodeId: source.nodeId, handle },
    target,
    state: 'normal',
    fixed: false,
    type: typeOf(source.nodeId, source.port),
    message: null,
    lane: null,
  };
}

export function valueEdgesOf(
  requests: readonly ValueRequest[],
  sourceOf: SourceOf,
  typeOf: TypeOf,
): readonly GraphSceneEdge[] {
  const edges = new Map<string, GraphSceneEdge>();
  for (const request of requests) {
    const source = sourcedOf(request.value, sourceOf);
    if (source === undefined || source.nodeId === request.target.nodeId) continue;
    const edge = valueEdge(request, source, typeOf);
    edges.set(edge.id, edge);
  }
  return [...edges.values()];
}
