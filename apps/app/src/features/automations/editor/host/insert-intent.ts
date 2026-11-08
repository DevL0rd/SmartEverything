import {
  TRIGGER_KIND_PREFIX,
  PORT_VALUE,
  execPortsOf,
  type GraphNode,
  type Layout,
  type NodeKindLookup,
} from '@smarteverything/domain';
import { nodeName } from '@smarteverything/flow/graph/problem-types';
import type { NodeInput, PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { z } from 'zod';
import {
  nodeById,
  refuse,
  type Applied,
  type CanvasPoint,
  type GraphDocument,
  type IntentRuntime,
  type Message,
  type Planned,
} from './intent-env';

const FORK_KIND = 'flow.parallel';

export const INSERT_REQUEST = z.strictObject({
  kind: z.string().min(1),
  ports: z.record(z.string(), PORT_VALUE).optional(),
  after: z.strictObject({ nodeId: z.string().min(1), port: z.string().min(1) }).optional(),
  point: z.strictObject({ x: z.number(), y: z.number() }).optional(),
});

export type InsertRequest = z.infer<typeof INSERT_REQUEST>;

function titleOf(kind: string, kinds: NodeKindLookup): string {
  return kinds.get(kind)?.name ?? kind;
}

function sourceOf(
  doc: GraphDocument,
  request: InsertRequest,
  kinds: NodeKindLookup,
): GraphNode | string | undefined {
  if (request.after === undefined) return undefined;
  const source = nodeById(doc.program, request.after.nodeId);
  if (source === undefined) return 'That step is no longer on the canvas.';
  const { port } = request.after;
  if (!execPortsOf(source.kind, source, kinds).outputs.some((out) => out.port === port)) {
    return `${nodeName(source, kinds)} has no exit "${port}".`;
  }
  return source;
}

function placed(point: CanvasPoint | undefined, id: string): (a: Applied, l: Layout) => Layout {
  return (_applied, layout) =>
    point === undefined ? layout : { ...layout, nodes: { ...layout.nodes, [id]: point } };
}

function messageOf(kind: string, source: GraphNode | undefined, kinds: NodeKindLookup): Message {
  const name = titleOf(kind, kinds);
  const pair = kind === FORK_KIND ? ' with its Wait for all' : '';
  const where = source === undefined ? '' : ` after ${nodeName(source, kinds)}`;
  return { announcement: `Added ${name}${pair}${where}.` };
}

function rowsOf(kind: string, rt: IntentRuntime): Pick<NodeInput, 'branches' | 'cases'> {
  if (kind === 'flow.if') return { branches: [{ id: rt.newId(), when: { lit: true } }] };
  return kind === 'flow.switch' ? { cases: [] } : {};
}

function opOf(request: InsertRequest, source: GraphNode | undefined, rt: IntentRuntime): PatchOp {
  const node: NodeInput = {
    id: rt.newId(),
    kind: request.kind,
    ...(request.ports === undefined ? {} : { ports: request.ports }),
    ...rowsOf(request.kind, rt),
  };
  return {
    op: 'add',
    node,
    ...(source === undefined || request.after === undefined
      ? {}
      : { after: { key: source.key, port: request.after.port } }),
    ...(request.kind === FORK_KIND ? { join: { id: rt.newId() } } : {}),
  };
}

function addedId(op: PatchOp): string {
  return op.op === 'add' ? (op.node.id ?? '') : '';
}

export function planInsert(doc: GraphDocument, request: InsertRequest, rt: IntentRuntime): Planned {
  const { kinds } = rt;
  if (!kinds.has(request.kind)) return refuse(`There is no step called "${request.kind}".`);
  if (request.kind.startsWith(TRIGGER_KIND_PREFIX) && request.after !== undefined) {
    return refuse('A trigger starts the automation. It does not go on a wire.');
  }
  const source = sourceOf(doc, request, kinds);
  if (typeof source === 'string') return refuse(source);
  const op = opOf(request, source, rt);
  const id = addedId(op);
  return {
    ok: true,
    ops: [op],
    layout: placed(request.point, id),
    select: () => [id],
    message: () => messageOf(request.kind, source, kinds),
  };
}
