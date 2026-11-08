import { clock } from '../../../../format/time';
import type { GraphRunNode, GraphRunOverlay } from './run-overlay';
import type {
  GraphScene,
  GraphSceneEdge,
  GraphSceneNode,
  SceneExecRow,
  SceneFamily,
} from './scene-contract';
import { progressText } from './taken-wires';

export interface NamesOptions {
  readonly run?: GraphRunOverlay | undefined;
  readonly zone?: string | null | undefined;
}

interface Facts {
  readonly nodes: ReadonlyMap<string, GraphSceneNode>;
  readonly ordinals: ReadonlyMap<string, number>;
  readonly triggers: number;
  readonly steps: number;
  readonly into: ReadonlyMap<string, readonly GraphSceneEdge[]>;
  readonly leaving: ReadonlyMap<string, GraphSceneEdge>;
  readonly feeding: ReadonlyMap<string, GraphSceneEdge>;
  readonly users: ReadonlyMap<string, readonly string[]>;
}

const UNNUMBERED: ReadonlySet<SceneFamily> = new Set(['trigger', 'start', 'failure', 'value']);

const NO_EDGES: readonly GraphSceneEdge[] = [];

const RUN_PHRASES: Readonly<Record<GraphRunNode['state'], string>> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
  waiting: 'Waiting',
};

function pinKey(nodeId: string, handle: string): string {
  return `${nodeId}|${handle}`;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function upperFirst(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const held = grouped.get(keyOf(item)) ?? [];
    held.push(item);
    grouped.set(keyOf(item), held);
  }
  return grouped;
}

function numbering(scene: GraphScene): {
  ordinals: Map<string, number>;
  triggers: number;
  steps: number;
} {
  const ordinals = new Map<string, number>();
  let triggers = 0;
  let steps = 0;
  for (const node of scene.nodes) {
    if (node.family === 'trigger') {
      triggers += 1;
      ordinals.set(node.id, triggers);
    } else if (!UNNUMBERED.has(node.family)) {
      steps += 1;
      ordinals.set(node.id, steps);
    }
  }
  return { ordinals, triggers, steps };
}

function usersOf(
  edges: readonly GraphSceneEdge[],
  nodes: ReadonlyMap<string, GraphSceneNode>,
): Map<string, string[]> {
  const users = new Map<string, string[]>();
  for (const edge of edges) {
    const title = nodes.get(edge.target.nodeId)?.title;
    if (title === undefined) continue;
    const held = users.get(edge.source.nodeId) ?? [];
    if (!held.includes(title)) held.push(title);
    users.set(edge.source.nodeId, held);
  }
  return users;
}

function factsOf(scene: GraphScene): Facts {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const exec = scene.edges.filter((edge) => edge.kind === 'exec');
  const values = scene.edges.filter((edge) => edge.kind === 'value');
  return {
    nodes,
    ...numbering(scene),
    into: groupBy(exec, (edge) => edge.target.nodeId),
    leaving: new Map(exec.map((edge) => [pinKey(edge.source.nodeId, edge.source.handle), edge])),
    feeding: new Map(values.map((edge) => [pinKey(edge.target.nodeId, edge.target.handle), edge])),
    users: usersOf(values, nodes),
  };
}

const SPECIAL_HEADS: Partial<Record<SceneFamily, (node: GraphSceneNode, facts: Facts) => string>> =
  {
    trigger: (node, facts) =>
      `Trigger ${String(facts.ordinals.get(node.id) ?? 0)} of ${String(facts.triggers)}, ${node.title}, ${upperFirst(node.category)}`,
    start: (node) => `Start, ${node.title}`,
    failure: (node) => `If the run fails, ${node.title}`,
    value: (node) => `Value, ${node.title}, ${upperFirst(node.category)}`,
  };

function headOf(node: GraphSceneNode, facts: Facts): string {
  const special = SPECIAL_HEADS[node.family];
  if (special !== undefined) return special(node, facts);
  const ordinal = String(facts.ordinals.get(node.id) ?? 0);
  return `Step ${ordinal} of ${String(facts.steps)}, ${node.title}, ${upperFirst(node.category)}`;
}

function endText(cap: string | null): string {
  if (cap === null) return 'is not connected';
  if (cap === 'End' || cap === 'End of run') return 'ends the run';
  if (cap === 'End of this part') return 'ends this part';
  return `ends the pass, ${cap}`;
}

function rowText(node: GraphSceneNode, row: SceneExecRow, facts: Facts): string {
  const condition = row.condition?.text ?? '';
  const name = node.family === 'trigger' ? 'Then' : row.label;
  const label = condition === '' ? name : `${name} ${condition}`;
  const edge = facts.leaving.get(pinKey(node.id, row.handle));
  const target = edge === undefined ? undefined : facts.nodes.get(edge.target.nodeId);
  return `${label} ${target === undefined ? endText(row.endCap) : `goes to ${target.title}`}`;
}

function exitsOf(node: GraphSceneNode, facts: Facts): readonly string[] {
  const then = node.rows.filter((row) => row.role === 'next');
  const branches = node.rows.filter((row) => row.role === 'branch');
  const lanes = node.rows.filter((row) => row.role === 'lane');
  const groups: readonly (readonly [string, readonly SceneExecRow[]])[] = [
    ['', then],
    ['Branches: ', branches],
    ['Lanes: ', lanes],
  ];
  return groups
    .filter(([, rows]) => rows.length > 0)
    .map(([lead, rows]) =>
      sentence(`${lead}${rows.map((row) => rowText(node, row, facts)).join('; ')}`),
    );
}

function sourceText(edge: GraphSceneEdge, facts: Facts): string | undefined {
  const source = facts.nodes.get(edge.source.nodeId);
  if (source === undefined) return undefined;
  const row = source.rows.find((held) => held.handle === edge.source.handle);
  return row === undefined || row.role === 'next' ? source.title : `${source.title}, ${row.label}`;
}

function comesFrom(node: GraphSceneNode, facts: Facts): readonly string[] {
  const sources = (facts.into.get(node.id) ?? NO_EDGES).flatMap((edge) => {
    const text = sourceText(edge, facts);
    return text === undefined ? [] : [text];
  });
  return sources.length === 0 ? [] : [sentence(`Comes from ${sources.join('; ')}`)];
}

function inputText(
  node: GraphSceneNode,
  pin: GraphSceneNode['inputs'][number],
  facts: Facts,
): readonly string[] {
  const edge = facts.feeding.get(pinKey(node.id, pin.handle));
  const source = edge === undefined ? undefined : facts.nodes.get(edge.source.nodeId);
  const label = lowerFirst(pin.label);
  if (source !== undefined) return [`${label} from ${source.title}`];
  return pin.value === null || pin.value === '' ? [] : [`${label} ${pin.value}`];
}

function inputsOf(node: GraphSceneNode, facts: Facts): readonly string[] {
  const parts = node.inputs.flatMap((pin) => inputText(node, pin, facts));
  return parts.length === 0 ? [] : [sentence(`Inputs: ${parts.join('; ')}`)];
}

function usedBy(node: GraphSceneNode, facts: Facts): readonly string[] {
  const users = facts.users.get(node.id) ?? [];
  return node.family === 'value' && users.length > 0
    ? [sentence(`Used by ${users.join(', ')}`)]
    : [];
}

function problemsOf(node: GraphSceneNode): readonly string[] {
  return node.problems.map((problem) => sentence(`Problem: ${problem.message}`));
}

function runText(node: GraphSceneNode, options: NamesOptions): readonly string[] {
  const run = options.run?.nodes[node.id];
  if (run === undefined) return [];
  const wake =
    run.wakeAt === undefined ? '' : `, wakes at ${clock(run.wakeAt, options.zone ?? null)}`;
  const failure = run.state === 'failed' && run.text !== undefined ? `: ${run.text}` : '';
  const progress = run.progress === undefined ? '' : `, ${progressText(run.progress)}`;
  return [sentence(`${RUN_PHRASES[run.state]}${failure}${wake}${progress}`)];
}

function nameOf(node: GraphSceneNode, facts: Facts, options: NamesOptions): string {
  return [
    sentence(headOf(node, facts)),
    ...exitsOf(node, facts),
    ...usedBy(node, facts),
    ...comesFrom(node, facts),
    ...inputsOf(node, facts),
    ...problemsOf(node),
    ...runText(node, options),
  ].join(' ');
}

export function a11yNames(
  scene: GraphScene,
  options: NamesOptions = {},
): ReadonlyMap<string, string> {
  const facts = factsOf(scene);
  return new Map(scene.nodes.map((node) => [node.id, nameOf(node, facts, options)]));
}
