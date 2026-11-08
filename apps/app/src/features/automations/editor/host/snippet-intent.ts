import type { NodeKindLookup } from '@smarteverything/domain';
import {
  execClassOf,
  execPortsOf,
  type AutomationV3,
  type FlowNode,
  type GraphNode,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { joinOfFork } from '@smarteverything/flow/graph/ops/wires';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import {
  CLIPBOARD_FORMAT,
  CLIPBOARD_VERSION,
  planPasteOf,
  type ClipboardPayload,
} from './clipboard-port';
import {
  nodeById,
  refuse,
  type CanvasPoint,
  type GraphDocument,
  type IntentRuntime,
  type Planned,
} from './intent-env';

export interface SnippetAfter {
  readonly nodeId: string;
  readonly port: string;
}

export const REFUSED_EMPTY_SNIPPET = 'That snippet has no steps.';
export const REFUSED_SNIPPET_GONE = 'That step is no longer on the canvas.';

function shell(nodes: readonly FlowNode[]): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...nodes] },
    policy: { mode: 'single' },
  };
}

interface Chain {
  readonly payload: ClipboardPayload;
  readonly entry: string;
}

function chainOf(nodes: readonly FlowNode[], kinds: NodeKindLookup): Chain | undefined {
  const graph = unstructure(shell(nodes), kinds);
  const start = graph.nodes.find((node) => execClassOf(node.kind, kinds) === 'start');
  const entry = start?.to?.['next'];
  if (entry === undefined) return undefined;
  const body = graph.nodes.filter((node) => {
    const execClass = execClassOf(node.kind, kinds);
    return execClass !== 'start' && execClass !== 'failure';
  });
  const joins = Object.fromEntries(
    body.flatMap((node) => {
      const join = joinOfFork(graph, node.key, kinds);
      return join === undefined ? [] : [[node.key, join] as const];
    }),
  );
  return {
    entry,
    payload: {
      format: CLIPBOARD_FORMAT,
      version: CLIPBOARD_VERSION,
      nodes: body,
      triggers: [],
      joins,
      layout: {},
    },
  };
}

function openEnds(
  nodes: readonly GraphNode[],
  kinds: NodeKindLookup,
): readonly { key: string; port: string }[] {
  return nodes.flatMap((node) =>
    execPortsOf(node.kind, node, kinds)
      .outputs.filter((out) => out.role === 'next' && out.target === undefined)
      .map((out) => ({ key: node.key, port: out.port })),
  );
}

function wiring(
  doc: GraphDocument,
  after: SnippetAfter | undefined,
  entry: string,
  kinds: NodeKindLookup,
): NonNullable<Parameters<typeof planPasteOf>[3]['attach']> {
  return (nodes, keyOf) => {
    if (after === undefined) return [];
    const source = nodeById(doc.program, after.nodeId);
    if (source === undefined) return [];
    const old = execPortsOf(source.kind, source, kinds).outputs.find(
      (out) => out.port === after.port,
    )?.target;
    const into: PatchOp = { op: 'connect', from: source.key, port: after.port, to: keyOf(entry) };
    const ends: readonly PatchOp[] =
      old === undefined
        ? []
        : openEnds(nodes, kinds).map((end) => ({
            op: 'connect',
            from: end.key,
            port: end.port,
            to: old,
          }));
    return [into, ...ends];
  };
}

export function planSnippet(
  doc: GraphDocument,
  request: {
    readonly nodes: readonly FlowNode[];
    readonly after?: SnippetAfter | undefined;
    readonly point?: CanvasPoint | undefined;
  },
  rt: IntentRuntime,
): Planned {
  const kinds = rt.kinds;
  const chain = chainOf(request.nodes, kinds);
  if (chain === undefined) return refuse(REFUSED_EMPTY_SNIPPET);
  if (request.after !== undefined && nodeById(doc.program, request.after.nodeId) === undefined) {
    return refuse(REFUSED_SNIPPET_GONE);
  }
  return planPasteOf(doc, chain.payload, rt, {
    at: request.point,
    verb: 'Added',
    attach: wiring(doc, request.after, chain.entry, kinds),
  });
}
