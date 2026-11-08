import type { NodeKindLookup } from '@smarteverything/domain';
import { execPortsOf, isExecNode, type GraphNode } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { z } from 'zod';
import {
  holderById,
  nodeById,
  plural,
  refuse,
  type Applied,
  type GraphDocument,
  type IntentRuntime,
  type Planned,
} from './intent-env';

export const WRAPPERS = ['if', 'loop', 'try', 'together'] as const;

export const WRAP_REQUEST = z.strictObject({
  ids: z.array(z.string().min(1)).min(1),
  wrapper: z.enum(WRAPPERS),
});

export type WrapRequest = z.infer<typeof WRAP_REQUEST>;
export type Wrapper = (typeof WRAPPERS)[number];

export const REFUSED_WRAP_KIND = 'Only steps can be wrapped.';
export const REFUSED_WRAP_GONE = 'Those steps are no longer on the canvas.';

interface Ids {
  readonly container: string;
  readonly row: string;
}

interface WrapShape {
  readonly kind: string;
  readonly title: string;
}

const SHAPES: Readonly<Record<Wrapper, WrapShape>> = {
  if: { kind: 'flow.if', title: 'If' },
  loop: { kind: 'flow.repeat', title: 'Repeat' },
  try: { kind: 'flow.try', title: 'Try' },
  together: { kind: 'flow.parallel', title: 'Do together' },
};

function chainOrder(
  program: GraphDocument['program'],
  nodes: readonly GraphNode[],
  kinds: NodeKindLookup,
): readonly string[] {
  const keys = new Set(nodes.map((node) => node.key));
  const fed = new Set(
    nodes.flatMap((node) =>
      execPortsOf(node.kind, node, kinds).outputs.flatMap((out) =>
        out.target !== undefined && keys.has(out.target) ? [out.target] : [],
      ),
    ),
  );
  const heads = nodes.filter((node) => !fed.has(node.key));
  const ordered: string[] = [];
  const seen = new Set<string>();
  const queue = heads.map((node) => node.key);
  for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
    const node = program.nodes.find((candidate) => candidate.key === key);
    const targets = node === undefined ? [] : execPortsOf(node.kind, node, kinds).outputs;
    queue.push(
      ...targets.flatMap((out) =>
        out.target !== undefined && keys.has(out.target) ? [out.target] : [],
      ),
    );
  }
  return [...ordered, ...nodes.map((node) => node.key).filter((key) => !seen.has(key))];
}

function wrapOp(shape: WrapShape, keys: [string, ...string[]], ids: Ids): PatchOp {
  const base = { op: 'wrap', keys, kind: shape.kind, id: ids.container } as const;
  if (shape.kind === 'flow.if') return { ...base, when: { lit: true }, rowId: ids.row };
  if (shape.kind === 'flow.repeat') return { ...base, ports: { times: { lit: 2 } } };
  return base;
}

function selectedNodes(
  doc: GraphDocument,
  ids: readonly string[],
  kinds: NodeKindLookup,
): readonly GraphNode[] | string {
  const holders = ids.flatMap((id) => {
    const holder = holderById(doc.program, id);
    return holder === undefined ? [] : [holder];
  });
  if (holders.length === 0) return REFUSED_WRAP_GONE;
  const nodes = holders.flatMap((holder) => {
    const node = nodeById(doc.program, holder.id);
    return node !== undefined && isExecNode(node.kind, kinds) ? [node] : [];
  });
  return nodes.length === holders.length ? nodes : REFUSED_WRAP_KIND;
}

export function planWrap(doc: GraphDocument, request: WrapRequest, rt: IntentRuntime): Planned {
  const kinds = rt.kinds;
  const picked = selectedNodes(doc, request.ids, kinds);
  if (typeof picked === 'string') return refuse(picked);
  const [first, ...rest] = chainOrder(doc.program, picked, kinds);
  if (first === undefined) return refuse(REFUSED_WRAP_GONE);
  const shape = SHAPES[request.wrapper];
  const ids = { container: rt.newId(), row: rt.newId() };
  return {
    ok: true,
    ops: [wrapOp(shape, [first, ...rest], ids)],
    select: () => [ids.container],
    message: (applied: Applied) => ({
      announcement: `Wrapped ${plural(picked.length, 'step', 'steps')} in ${shape.title}${applied.created.length > 1 ? ' with its Wait for all' : ''}.`,
    }),
  };
}
