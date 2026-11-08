import {
  execPortsOf,
  wire,
  type GraphNode,
  type NodeKindLookup,
  type PortValue,
} from '@smarteverything/domain';
import { canConnect } from '@smarteverything/flow/graph/ops/can-connect';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { nodeName, portLabel } from '@smarteverything/flow/graph/problem-types';
import { z } from 'zod';
import { parseHandle, type HandleRef } from '../../model/graph/handle-ids';
import {
  holderById,
  nodeById,
  refuse,
  type GraphDocument,
  type Holder,
  type Planned,
} from './intent-env';

export const EDGE_END_REQUEST = z.strictObject({
  nodeId: z.string().min(1),
  handle: z.string().min(1),
});

export const CONNECT_REQUEST = z.strictObject({ from: EDGE_END_REQUEST, to: EDGE_END_REQUEST });

export type EdgeEndRequest = z.infer<typeof EDGE_END_REQUEST>;
export type ConnectRequest = z.infer<typeof CONNECT_REQUEST>;

export const REFUSED_GONE = 'That step is no longer on the canvas.';
export const REFUSED_PIN = 'Drag from an output pin.';
export const REFUSED_TRIGGER = 'A trigger starts the automation. It has no wire to a step.';
export const REFUSED_SELF = 'A value cannot feed the step that makes it.';
export const REFUSED_TARGET = 'Drop the wire on an input pin or a step.';

function currentTarget(source: GraphNode, port: string, kinds: NodeKindLookup): string | undefined {
  return execPortsOf(source.kind, source, kinds).outputs.find((out) => out.port === port)?.target;
}

function connectExec(
  doc: GraphDocument,
  ends: { readonly from: EdgeEndRequest; readonly toId: string },
  port: string,
  kinds: NodeKindLookup,
): Planned {
  const { from, toId } = ends;
  const source = nodeById(doc.program, from.nodeId);
  const target = nodeById(doc.program, toId);
  if (source === undefined) return refuse(REFUSED_GONE);
  if (target === undefined) {
    return refuse(holderById(doc.program, toId) === undefined ? REFUSED_GONE : REFUSED_TRIGGER);
  }
  const verdict = canConnect(doc.program, { from: source.key, port, to: target.key }, kinds);
  if (!verdict.ok) return refuse(verdict.message);
  const previous = currentTarget(source, port, kinds);
  const op: PatchOp = { op: 'connect', from: source.key, port, to: target.key };
  const label = portLabel(source, port, kinds);
  const there = nodeName(target, kinds);
  const text = `${label} of ${nodeName(source, kinds)} now goes to ${there}.`;
  const replaced = `Replaced: ${label} now goes to ${there}.`;
  return {
    ok: true,
    ops: previous === target.key ? [] : [op],
    unchanged: `${label} already goes to ${there}.`,
    message: () =>
      previous === undefined ? { announcement: text } : { announcement: replaced, toast: replaced },
  };
}

function conditionOp(holder: Holder, ref: HandleRef, value: PortValue): PatchOp | undefined {
  if (ref.kind !== 'condition') return undefined;
  return ref.group === 'row'
    ? { op: 'row', key: holder.key, edit: { row: 'branch', t: 'when', id: ref.id, when: value } }
    : {
        op: 'row',
        key: holder.key,
        edit: { row: 'case', t: 'match', id: ref.id, match: { when: value } },
      };
}

function valueOp(target: Holder, ref: HandleRef, value: PortValue): PatchOp | undefined {
  if (ref.kind === 'condition') return conditionOp(target, ref, value);
  if (ref.kind !== 'valueIn') return undefined;
  if (target.kind === 'flow.start' && ref.port === 'admit') return { op: 'header', admit: value };
  return { op: 'set', key: target.key, ports: { [ref.port]: value } };
}

function connectValue(
  doc: GraphDocument,
  request: ConnectRequest,
  out: string,
  kinds: NodeKindLookup,
): Planned {
  const source = holderById(doc.program, request.from.nodeId);
  const target = holderById(doc.program, request.to.nodeId);
  if (source === undefined || target === undefined) return refuse(REFUSED_GONE);
  if (source.id === target.id) return refuse(REFUSED_SELF);
  const ref = parseHandle(request.to.handle);
  const op = ref === undefined ? undefined : valueOp(target, ref, wire(source.key, out));
  if (op === undefined) return refuse(REFUSED_TARGET);
  return {
    ok: true,
    ops: [op],
    message: () => ({
      announcement: `${nodeName(target, kinds)} now reads ${out} from ${nodeName(source, kinds)}.`,
    }),
  };
}

export function planConnect(
  doc: GraphDocument,
  request: ConnectRequest,
  kinds: NodeKindLookup,
): Planned {
  const from = parseHandle(request.from.handle);
  if (from?.kind === 'execOut') {
    return connectExec(doc, { from: request.from, toId: request.to.nodeId }, from.port, kinds);
  }
  if (from?.kind === 'valueOut') return connectValue(doc, request, from.name, kinds);
  return refuse(REFUSED_PIN);
}
