import type { GraphNode, NodeKindLookup, ProgramV4 } from '@smarteverything/domain';
import { ERROR_EXIT_OUTPUTS, ERROR_EXIT_PORT, canRouteOnError } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { failureModeOps } from './behaviour-model';
import type { TargetRef } from './graph-connections-model';
import { connectionsOf } from './graph-connections-model';

export const ON_ERROR_COPY = {
  title: 'On error',
  connect: 'Connect what happens if it fails',
  notConnected: 'If it fails is not connected',
  armedHint: 'Drag from If it fails on the card, or pick a step for it in Goes to.',
  carries: 'If it fails passes on',
  fallback:
    'Until If it fails is connected, a failure does what When it fails says in More options.',
} as const;

export interface ErrorValueRow {
  readonly name: string;
  readonly title: string;
  readonly description: string;
}

export interface OnErrorView {
  readonly armed: boolean;
  readonly target: TargetRef | undefined;
  readonly statusText: string;
  readonly values: readonly ErrorValueRow[];
}

function titleOf(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export const ERROR_VALUE_ROWS: readonly ErrorValueRow[] = ERROR_EXIT_OUTPUTS.map((port) => ({
  name: port.name,
  title: titleOf(port.name),
  description: port.description,
}));

export function hasOnError(kindId: string, kinds: NodeKindLookup): boolean {
  return canRouteOnError(kindId, kinds);
}

export function onErrorView(
  program: ProgramV4,
  node: GraphNode,
  kinds: NodeKindLookup,
): OnErrorView {
  const row = connectionsOf(program, node, kinds).rows.find(
    (item) => item.port === ERROR_EXIT_PORT,
  );
  const target = row?.target;
  return {
    armed: node.policy?.onError === 'route' || node.to?.[ERROR_EXIT_PORT] !== undefined,
    target,
    statusText:
      target === undefined ? ON_ERROR_COPY.notConnected : `If it fails goes to ${target.name}`,
    values: ERROR_VALUE_ROWS,
  };
}

export function armOps(node: GraphNode): readonly PatchOp[] {
  return failureModeOps(node, 'route');
}
