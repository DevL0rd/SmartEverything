import type { FlowNode, PortValue } from '@smarteverything/domain';
import type { EdgeEnd } from './contract';
import { laneIdOf } from './tree-lanes';

export interface Request {
  readonly port: string;
  readonly label: string;
  readonly value: PortValue;
  readonly to: EdgeEnd;
}

function portRequests(node: FlowNode): readonly Request[] {
  return Object.entries(node.ports ?? {}).map(([port, value]) => ({
    port,
    label: port,
    value,
    to: { nodeId: node.id, port },
  }));
}

function rowRequests(node: FlowNode): readonly Request[] {
  const branches = (node.branches ?? []).map((row) => ({
    port: 'when',
    label: 'when',
    value: row.when,
    to: { nodeId: laneIdOf(node.id, { kind: 'branch', id: row.id }), port: 'when' },
  }));
  const cases = (node.cases ?? []).flatMap((row) =>
    'when' in row.match
      ? [
          {
            port: 'when',
            label: 'when',
            value: row.match.when,
            to: { nodeId: laneIdOf(node.id, { kind: 'case', id: row.id }), port: 'when' },
          },
        ]
      : [],
  );
  return [...branches, ...cases];
}

function outputRequests(node: FlowNode): readonly Request[] {
  return (node.outputs ?? []).flatMap((output) =>
    Object.values(output.values).map((value) => ({
      port: output.name,
      label: output.name,
      value,
      to: { nodeId: node.id, port: output.name },
    })),
  );
}

export function requestsOf(node: FlowNode): readonly Request[] {
  return [...portRequests(node), ...rowRequests(node), ...outputRequests(node)];
}
