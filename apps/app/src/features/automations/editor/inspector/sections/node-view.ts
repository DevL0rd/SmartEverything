import type {
  DescribeContext,
  FlowNode,
  WireScope,
  NodeKind,
  NodeRegistry,
  TriggerNode,
} from '@smarteverything/domain';
import { nodeLabel, nodeSummaryText } from '@smarteverything/domain';
import type { Entry, ProgramIndex } from '@smarteverything/flow/program/lookup';

export type NodeBadge = 'Trigger' | 'Value' | 'Block' | 'Step' | 'Custom Node';

export const REUSABLE_CALL_KIND = 'fn.call';

const LOOP_KIND_IDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
]);

export interface NodeView {
  readonly entry: Entry;
  readonly node: FlowNode | TriggerNode;
  readonly id: string;
  readonly key: string;
  readonly kind: NodeKind | undefined;
  readonly badge: NodeBadge;
  readonly title: string;
}

export interface Loop {
  readonly key: string;
  readonly label: string;
  readonly innermost: boolean;
}

export function badgeOf(kindId: string, kind: NodeKind | undefined): NodeBadge {
  if (kindId === REUSABLE_CALL_KIND) return 'Custom Node';
  if (kind === undefined) return 'Step';
  if (kind.class === 'trigger') return 'Trigger';
  if (kind.class === 'pure' || kind.class === 'read') return 'Value';
  return kind.scopes === undefined ? 'Step' : 'Block';
}

export function nodeView(
  index: ProgramIndex,
  id: string,
  registry: NodeRegistry,
): NodeView | undefined {
  const entry = index.byId.get(id);
  if (entry === undefined) return undefined;
  const kind = registry.get(entry.node.kind);
  return {
    entry,
    node: entry.node,
    id,
    key: entry.node.key,
    kind,
    badge: badgeOf(entry.node.kind, kind),
    title: nodeLabel(entry.node, (kindId) => registry.get(kindId)),
  };
}

export function flowNodeOf(view: NodeView): FlowNode | undefined {
  return view.entry.kind === 'node' ? view.entry.node : undefined;
}

export function triggerOf(view: NodeView): TriggerNode | undefined {
  return view.entry.kind === 'trigger' ? view.entry.node : undefined;
}

export function enclosingLoops(
  index: ProgramIndex,
  view: NodeView,
  describe: DescribeContext,
  scope: WireScope,
): readonly Loop[] {
  if (view.entry.kind !== 'node') return [];
  const loops = view.entry.ancestors.flatMap((key) => {
    const owner = index.byKey.get(key);
    return owner?.kind === 'node' && LOOP_KIND_IDS.has(owner.node.kind) ? [owner.node] : [];
  });
  return loops
    .map((loop, position) => ({
      key: loop.key,
      label: nodeSummaryText(loop, describe, scope),
      innermost: position === loops.length - 1,
    }))
    .reverse();
}
