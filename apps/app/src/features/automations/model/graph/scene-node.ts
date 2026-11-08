import {
  nodeSummaryText,
  upperFirst,
  type GraphNode,
  type NodeKindLookup,
  type TriggerNode,
} from '@smarteverything/domain';
import { cardClassOf } from '@smarteverything/flow/graph/metrics';
import { execInHandle, execOutHandle } from './handle-ids';
import type {
  GraphSceneNode,
  SceneExecRow,
  SceneFamily,
  ScenePin,
  SceneProblem,
} from './scene-contract';
import { execRowsOf, hasExecInput, latentErrorHandle, type ExecFacts } from './scene-exec';

export interface NodeParts {
  readonly title: string;
  readonly summary: string | null;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly pairIndex: number | null;
  readonly mergeCount: number | null;
  readonly inputs: readonly ScenePin[];
  readonly outputs: readonly ScenePin[];
  readonly problems: readonly SceneProblem[];
}

const UNKNOWN_ICON = 'circle-help';
const UNKNOWN_CATEGORY = 'utilities';
const TRIGGER_ROW_LABEL = 'Starts';

function visualOf(
  kinds: NodeKindLookup,
  kindId: string,
): { icon: string; category: string; name: string } {
  const kind = kinds.get(kindId);
  return kind === undefined
    ? { icon: UNKNOWN_ICON, category: UNKNOWN_CATEGORY, name: kindId }
    : { icon: kind.icon, category: kind.category, name: kind.name };
}

function triggerRow(): SceneExecRow {
  return {
    handle: execOutHandle('next'),
    port: 'next',
    role: 'next',
    label: TRIGGER_ROW_LABEL,
    wired: true,
    endCap: null,
    condition: null,
  };
}

type NodeBase = Omit<GraphSceneNode, 'family' | 'execIn' | 'errorHandle' | 'rows'>;

function base(node: GraphNode | TriggerNode, facts: ExecFacts, parts: NodeParts): NodeBase {
  const { describe, sentence, kinds } = facts.pins;
  const visual = visualOf(kinds, node.kind);
  const title = parts.title === '' ? (node.label ?? visual.name) : parts.title;
  const summary = parts.summary ?? upperFirst(nodeSummaryText(node, describe, sentence));
  return {
    id: node.id,
    key: node.key,
    kind: node.kind,
    title,
    kindName: visual.name,
    summary: summary === title ? '' : summary,
    icon: visual.icon,
    category: visual.category,
    ...parts.rect,
    enabled: node.enabled !== false,
    pairIndex: parts.pairIndex,
    mergeCount: parts.mergeCount,
    inputs: [...parts.inputs],
    outputs: [...parts.outputs],
    problems: [...parts.problems],
  };
}

export function graphSceneNode(
  node: GraphNode,
  facts: ExecFacts,
  parts: NodeParts,
  automation: boolean,
): GraphSceneNode {
  const { kinds } = facts.graph;
  const family: SceneFamily = cardClassOf(node.kind, kinds);
  const rows = execRowsOf(facts, node, kinds);
  return {
    ...base(node, facts, parts),
    family,
    execIn: hasExecInput(node, automation, kinds) ? execInHandle() : null,
    errorHandle: latentErrorHandle(node.kind, rows, kinds),
    rows: [...rows],
  };
}

export function triggerSceneNode(
  node: TriggerNode,
  facts: ExecFacts,
  parts: NodeParts,
): GraphSceneNode {
  return {
    ...base(node, facts, parts),
    family: 'trigger',
    execIn: null,
    errorHandle: null,
    rows: [triggerRow()],
  };
}
