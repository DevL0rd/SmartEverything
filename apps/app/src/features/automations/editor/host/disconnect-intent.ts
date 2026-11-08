import type { NodeKindLookup } from '@smarteverything/domain';
import { execPortsOf, type PortValue } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { nodeName, portLabel } from '@smarteverything/flow/graph/problem-types';
import { z } from 'zod';
import { parseHandle } from '../../model/graph/handle-ids';
import { EDGE_END_REQUEST, REFUSED_GONE, REFUSED_PIN } from './connect-intent';
import {
  holderById,
  nodeById,
  nodeByKey,
  refuse,
  type GraphDocument,
  type Holder,
  type Planned,
} from './intent-env';

export const DISCONNECT_REQUEST = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('exec'), from: EDGE_END_REQUEST }),
  z.strictObject({ kind: z.literal('value'), target: EDGE_END_REQUEST }),
]);

export type DisconnectRequest = z.infer<typeof DISCONNECT_REQUEST>;

export const REFUSED_CONDITION =
  'A condition always holds a value. Type one in the inspector or wire another source.';
export const REFUSED_NO_WIRE = 'There is no wire there.';

function disconnectExec(
  doc: GraphDocument,
  nodeId: string,
  handle: string,
  kinds: NodeKindLookup,
): Planned {
  const source = nodeById(doc.program, nodeId);
  const ref = parseHandle(handle);
  if (source === undefined) return refuse(REFUSED_GONE);
  if (ref?.kind !== 'execOut') return refuse(REFUSED_PIN);
  const out = execPortsOf(source.kind, source, kinds).outputs.find(
    (item) => item.port === ref.port,
  );
  const target = out?.target === undefined ? undefined : nodeByKey(doc.program, out.target);
  if (out === undefined || target === undefined) return refuse(REFUSED_NO_WIRE);
  const label = portLabel(source, ref.port, kinds);
  return {
    ok: true,
    ops: [{ op: 'disconnect', from: source.key, port: ref.port }],
    message: () => ({
      announcement: `${label} of ${nodeName(source, kinds)} no longer goes to ${nodeName(target, kinds)}.`,
    }),
  };
}

function isAdmit(holder: Holder, port: string): boolean {
  return holder.kind === 'flow.start' && port === 'admit';
}

function valueAt(doc: GraphDocument, holder: Holder, port: string): PortValue | undefined {
  if (!isAdmit(holder, port)) return holder.ports?.[port];
  return doc.program.kind === 'automation' ? doc.program.admit : undefined;
}

function clearOp(holder: Holder, port: string): PatchOp {
  return isAdmit(holder, port)
    ? { op: 'header', admit: null }
    : { op: 'unset', key: holder.key, ports: [port] };
}

function disconnectValue(
  doc: GraphDocument,
  nodeId: string,
  handle: string,
  kinds: NodeKindLookup,
): Planned {
  const holder = holderById(doc.program, nodeId);
  const ref = parseHandle(handle);
  if (holder === undefined) return refuse(REFUSED_GONE);
  if (ref?.kind === 'condition') return refuse(REFUSED_CONDITION);
  if (ref?.kind !== 'valueIn') return refuse(REFUSED_PIN);
  const current = valueAt(doc, holder, ref.port);
  if (current === undefined || !('wire' in current)) return refuse(REFUSED_NO_WIRE);
  return {
    ok: true,
    ops: [clearOp(holder, ref.port)],
    message: () => ({
      announcement: `${nodeName(holder, kinds)} no longer reads ${ref.port} from a wire.`,
    }),
  };
}

export function planDisconnect(
  doc: GraphDocument,
  request: DisconnectRequest,
  kinds: NodeKindLookup,
): Planned {
  return request.kind === 'exec'
    ? disconnectExec(doc, request.from.nodeId, request.from.handle, kinds)
    : disconnectValue(doc, request.target.nodeId, request.target.handle, kinds);
}
