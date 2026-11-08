import type { ReactNode } from 'react';
import {
  execPortsOf,
  isExecNode,
  type ExecRole,
  type FlowType,
  type GraphNode,
  type NodeKindLookup,
  type PortValue,
  type ProgramV4,
} from '@smarteverything/domain';
import { canConnect } from '@smarteverything/flow/graph/ops/can-connect';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { wiresOf } from '@smarteverything/flow/graph/ops/wires';
import { nodeName, portLabel } from '@smarteverything/flow/graph/problem-types';
import { execInHandle, execOutHandle } from '../../../model/graph/handle-ids';
import type { GraphIntent } from '../../host/apply-intents';
import type { FieldControl } from '../schema-fields';

export interface GraphValueRequest {
  readonly nodeKey: string;
  readonly slot: string;
  readonly label: string;
  readonly helper: string | undefined;
  readonly type: FlowType | undefined;
  readonly control: FieldControl | undefined;
  readonly isStatic: boolean;
  readonly required: boolean;
  readonly value: PortValue | undefined;
  readonly message: string | undefined;
  readonly onChange: (value: PortValue | null) => void;
}

export type GraphValueSlot = (request: GraphValueRequest) => ReactNode;

export interface GraphInspectorActions {
  readonly apply: (ops: readonly PatchOp[]) => void;
  readonly intent: (intent: GraphIntent) => void;
  readonly jump: (nodeId: string) => void;
}

export interface GraphChoiceSubject {
  readonly options: readonly { readonly id: string; readonly label: string }[];
}

export interface GraphSectionProps {
  readonly program: ProgramV4;
  readonly kinds: NodeKindLookup;
  readonly node: GraphNode;
  readonly locked: boolean;
  readonly actions: GraphInspectorActions;
  readonly renderValue: GraphValueSlot;
  readonly subjectChoices: GraphChoiceSubject | undefined;
}

export interface TargetRef {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

export interface ConnectionRow {
  readonly port: string;
  readonly label: string;
  readonly role: ExecRole;
  readonly target: TargetRef | undefined;
  readonly targetText: string;
}

export interface IncomingRow {
  readonly id: string;
  readonly source: TargetRef;
  readonly text: string;
}

export interface ConnectionsModel {
  readonly rows: readonly ConnectionRow[];
  readonly incoming: readonly IncomingRow[];
  readonly acceptsInput: boolean;
}

export interface TargetChoice extends TargetRef {
  readonly description: string;
}

export const UNCONNECTED_TEXT = 'Ends here';
export const NOTHING_LEADS_HERE = 'Nothing leads here yet.';

function refOf(node: GraphNode, kinds: NodeKindLookup): TargetRef {
  return { id: node.id, key: node.key, name: nodeName(node, kinds) };
}

function targetTextOf(target: TargetRef | undefined, key: string | undefined): string {
  if (target !== undefined) return target.name;
  return key === undefined ? UNCONNECTED_TEXT : `Missing step "${key}"`;
}

function rowsOf(
  node: GraphNode,
  byKey: ReadonlyMap<string, GraphNode>,
  kinds: NodeKindLookup,
): readonly ConnectionRow[] {
  return execPortsOf(node.kind, node, kinds).outputs.map((out) => {
    const found = out.target === undefined ? undefined : byKey.get(out.target);
    const target = found === undefined ? undefined : refOf(found, kinds);
    return {
      port: out.port,
      label: out.label,
      role: out.role,
      target,
      targetText: targetTextOf(target, out.target),
    };
  });
}

function incomingText(source: GraphNode, port: string, kinds: NodeKindLookup): string {
  if (port === 'next') return nodeName(source, kinds);
  const role = execPortsOf(source.kind, source, kinds).outputs.find(
    (out) => out.port === port,
  )?.role;
  const label = portLabel(source, port, kinds);
  return `${nodeName(source, kinds)} · ${role === 'branch' ? `${label} path` : label}`;
}

function incomingOf(
  program: ProgramV4,
  node: GraphNode,
  byKey: ReadonlyMap<string, GraphNode>,
  kinds: NodeKindLookup,
): readonly IncomingRow[] {
  return wiresOf(program, kinds)
    .filter((wire) => wire.to === node.key)
    .flatMap((wire) => {
      const source = byKey.get(wire.from);
      if (source === undefined) return [];
      return [
        {
          id: `${wire.from}:${wire.port}`,
          source: refOf(source, kinds),
          text: incomingText(source, wire.port, kinds),
        },
      ];
    });
}

export function hasConnections(node: GraphNode, kinds: NodeKindLookup): boolean {
  return isExecNode(node.kind, kinds);
}

export function connectionsOf(
  program: ProgramV4,
  node: GraphNode,
  kinds: NodeKindLookup,
): ConnectionsModel {
  const byKey = new Map(program.nodes.map((item) => [item.key, item]));
  return {
    rows: rowsOf(node, byKey, kinds),
    incoming: incomingOf(program, node, byKey, kinds),
    acceptsInput: execPortsOf(node.kind, node, kinds).input,
  };
}

export function targetChoices(
  program: ProgramV4,
  node: GraphNode,
  port: string,
  kinds: NodeKindLookup,
): readonly TargetChoice[] {
  const current = execPortsOf(node.kind, node, kinds).outputs.find(
    (out) => out.port === port,
  )?.target;
  return program.nodes
    .filter(
      (candidate) =>
        isExecNode(candidate.kind, kinds) &&
        (candidate.key === current ||
          canConnect(program, { from: node.key, port, to: candidate.key }, kinds).ok),
    )
    .map((candidate) => ({ ...refOf(candidate, kinds), description: candidate.key }));
}

export function connectIntent(node: GraphNode, port: string, target: TargetRef): GraphIntent {
  return {
    type: 'connect',
    request: {
      from: { nodeId: node.id, handle: execOutHandle(port) },
      to: { nodeId: target.id, handle: execInHandle() },
    },
  };
}

export function clearIntent(node: GraphNode, port: string): GraphIntent {
  return {
    type: 'disconnect',
    request: { kind: 'exec', from: { nodeId: node.id, handle: execOutHandle(port) } },
  };
}
