import {
  appendTo,
  describedStep,
  execClassOf,
  nodeLabel,
  plainStep,
  type DescribeContext,
  type GraphNode,
  type Layout,
  type NodeKindLookup,
  type ProgramV4,
  type RefNames,
  type TriggerNode,
  type WireScope,
} from '@smarteverything/domain';
import { shownLayout } from '@smarteverything/flow/graph/layout-fit';
import { programSizes, type Density, type Size } from '@smarteverything/flow/graph/metrics';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import { execGraphOf, membershipOf } from '@smarteverything/flow/graph/regions';
import { structuredOf, type StructuredOf } from '@smarteverything/flow/graph/structured-of';
import type {
  GraphScene,
  GraphSceneEdge,
  GraphSceneNode,
  SceneDirection,
  SceneProblem,
  SceneProblemEntry,
} from './scene-contract';
import { execEdgesOf, triggerEdge, type ExecFacts } from './scene-exec';
import { graphSceneNode, triggerSceneNode, type NodeParts } from './scene-node';
import {
  admitPin,
  inputPins,
  labelOf,
  outputPins,
  programInputPins,
  type PinContext,
} from './scene-pins';
import { markProblemEdges, splitProblems } from './scene-problems';
import { withLanes } from './scene-lanes';
import { referencedPorts, requestsOf, valueEdgesOf, type SourceOf } from './scene-values';
import { sceneOrder } from './scene-order';
import { sceneSizes } from './scene-sizes';
import { pairsOf, summariesOf, titlesOf } from './scene-titles';

export interface GraphSceneInput {
  readonly direction: SceneDirection;
  readonly density?: Density;
  readonly layout?: Layout;
  readonly names?: RefNames;
  readonly kinds: NodeKindLookup;
  readonly problems?: readonly SceneProblemEntry[];
  readonly functions?: ReadonlyMap<string, { readonly name: string }>;
  readonly measured?: ReadonlyMap<string, Size>;
}

type Entry =
  | { readonly kind: 'trigger'; readonly node: TriggerNode }
  | { readonly kind: 'node'; readonly node: GraphNode };

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Facts {
  readonly program: ProgramV4;
  readonly exec: ExecFacts;
  readonly sizes: ReadonlyMap<string, Size>;
  readonly positions: ReadonlyMap<string, Point>;
  readonly pins: ReadonlyMap<string, PinParts>;
  readonly titles: ReadonlyMap<string, string>;
  readonly summaries: ReadonlyMap<string, string>;
  readonly pairs: ReadonlyMap<string, number>;
  readonly merges: ReadonlyMap<string, number>;
  readonly problems: ReadonlyMap<string, readonly SceneProblem[]>;
}

const INPUTS_ROOT = 'inputs';

const VALUE_PORT = 'value';
const EMPTY_LAYOUT: Layout = { nodes: {}, frames: [], comments: [] };
const NO_REFERENCES: ReadonlySet<string> = new Set();
const NO_PROBLEMS: readonly SceneProblem[] = [];

function triggersOf(program: ProgramV4): readonly TriggerNode[] {
  return program.kind === 'automation' ? program.triggers : [];
}

function entriesOf(program: ProgramV4): readonly Entry[] {
  return [
    ...triggersOf(program).map((node): Entry => ({ kind: 'trigger', node })),
    ...program.nodes.map((node): Entry => ({ kind: 'node', node })),
  ];
}

function pinContext(
  program: ProgramV4,
  names: RefNames | undefined,
  kinds: NodeKindLookup,
): PinContext {
  const describe: DescribeContext = {
    kinds: (id) => kinds.get(id),
    names: names ?? ((): undefined => undefined),
  };
  const nodes = new Map(program.nodes.map((node) => [node.key, node]));
  const scope: WireScope = {
    step: (key) => {
      const node = nodes.get(key);
      return node === undefined ? undefined : plainStep(nodeLabel(node, describe.kinds));
    },
    variable: (name) =>
      program.variables.some((variable) => variable.name === name) ? labelOf(name) : undefined,
    input: (name) => {
      const found = program.inputs.find((input) => input.name === name);
      return found === undefined ? undefined : (found.label ?? labelOf(name));
    },
    trigger: plainStep('Trigger'),
  };
  const [only, ...more] = triggersOf(program);
  const sentence: WireScope = {
    ...scope,
    step: (key) => {
      const node = nodes.get(key);
      return node === undefined ? undefined : describedStep(node, describe);
    },
    trigger:
      only === undefined || more.length > 0 ? plainStep('Trigger') : describedStep(only, describe),
    spoken: true,
  };
  const sole = (key: string, port: string): string | undefined => {
    const node = nodes.get(key);
    const outputs = node === undefined ? [] : (kinds.get(node.kind)?.outputs ?? []);
    const whole = outputs.length === 1 || port === VALUE_PORT;
    return node === undefined || !whole ? undefined : nodeLabel(node, describe.kinds);
  };
  return { describe, scope, sentence, sole, kinds };
}

function positionsOf(
  program: ProgramV4,
  input: GraphSceneInput,
  sizes: ReadonlyMap<string, Size>,
): ReadonlyMap<string, Point> {
  const options = {
    kinds: input.kinds,
    direction: input.direction,
    density: input.density ?? 'touch',
    sizes,
  };
  const shown = shownLayout(program, input.layout ?? EMPTY_LAYOUT, options).nodes;
  const found = new Map<string, Point>();
  for (const id of sizes.keys()) {
    const at = shown[id];
    if (at !== undefined) found.set(id, { x: at.x, y: at.y });
  }
  return found;
}

function entryOf(problem: GraphProblem): SceneProblemEntry {
  return {
    nodeId: problem.nodeId ?? null,
    code: problem.code,
    message: problem.message,
    fix: problem.fix,
  };
}

function withEntries(
  known: ReadonlyMap<string, readonly SceneProblem[]>,
  entries: readonly SceneProblemEntry[],
): ReadonlyMap<string, readonly SceneProblem[]> {
  if (entries.length === 0) return known;
  const merged = new Map<string, SceneProblem[]>();
  for (const [id, list] of known) merged.set(id, [...list]);
  for (const { nodeId, ...problem } of entries) {
    if (nodeId !== null) appendTo(merged, nodeId, problem);
  }
  return merged;
}

function countIncoming(edges: readonly GraphSceneEdge[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.target.nodeId, (counts.get(edge.target.nodeId) ?? 0) + 1);
  }
  return new Map([...counts].filter(([, count]) => count > 1));
}

function startIdOf(program: ProgramV4, kinds: NodeKindLookup): string | undefined {
  return program.nodes.find((node) => execClassOf(node.kind, kinds) === 'start')?.id;
}

type PinParts = Pick<NodeParts, 'inputs' | 'outputs'>;

function pinPartsOf(
  program: ProgramV4,
  referencedPorts: ReadonlyMap<string, ReadonlySet<string>>,
  entry: Entry,
  pins: PinContext,
): PinParts {
  const { node } = entry;
  const referenced = referencedPorts.get(node.id) ?? NO_REFERENCES;
  if (entry.kind === 'node' && execClassOf(node.kind, pins.kinds) === 'start') {
    return {
      inputs: program.kind === 'automation' ? [admitPin(program.admit, pins)] : [],
      outputs: programInputPins(program.inputs, referenced),
    };
  }
  return { inputs: inputPins(node, pins), outputs: outputPins(node, referenced, pins) };
}

function rectOf(facts: Facts, id: string): NodeParts['rect'] {
  const size = facts.sizes.get(id);
  const at = facts.positions.get(id);
  return { x: at?.x ?? 0, y: at?.y ?? 0, w: size?.w ?? 1, h: size?.h ?? 1 };
}

const NO_PINS: PinParts = { inputs: [], outputs: [] };

function partsOf(facts: Facts, entry: Entry): NodeParts {
  const { id } = entry.node;
  return {
    title: facts.titles.get(id) ?? '',
    summary: facts.summaries.get(id) ?? null,
    rect: rectOf(facts, id),
    pairIndex: facts.pairs.get(id) ?? null,
    mergeCount: facts.merges.get(id) ?? null,
    ...(facts.pins.get(id) ?? NO_PINS),
    problems: facts.problems.get(id) ?? NO_PROBLEMS,
  };
}

function sceneNodeOf(facts: Facts, entry: Entry): GraphSceneNode {
  const parts = partsOf(facts, entry);
  if (entry.kind === 'trigger') return triggerSceneNode(entry.node, facts.exec, parts);
  return graphSceneNode(entry.node, facts.exec, parts, facts.program.kind === 'automation');
}

function sceneNodesOf(
  facts: Facts,
  outcome: StructuredOf,
  placed: ReadonlySet<string>,
  kinds: NodeKindLookup,
): GraphSceneNode[] {
  const entries = new Map(entriesOf(facts.program).map((entry) => [entry.node.id, entry]));
  return sceneOrder(facts.program, outcome, facts.exec.membership.joinOf, kinds).flatMap((id) => {
    const entry = entries.get(id);
    return entry === undefined || !placed.has(id) ? [] : [sceneNodeOf(facts, entry)];
  });
}

function extentOf(nodes: readonly GraphSceneNode[]): { width: number; height: number } {
  return {
    width: Math.max(1, ...nodes.map((node) => node.x + node.w)),
    height: Math.max(1, ...nodes.map((node) => node.y + node.h)),
  };
}

function typeLookup(nodes: readonly GraphSceneNode[]): (id: string, port: string) => string | null {
  const types = new Map(
    nodes.map((node) => [node.id, new Map(node.outputs.map((pin) => [pin.name, pin.type]))]),
  );
  return (id, port) => types.get(id)?.get(port) ?? null;
}

interface Sized {
  readonly pins: ReadonlyMap<string, PinParts>;
  readonly sizes: ReadonlyMap<string, Size>;
}

function sizedPins(
  program: ProgramV4,
  input: GraphSceneInput,
  referenced: ReadonlyMap<string, ReadonlySet<string>>,
  context: PinContext,
): Sized {
  const pins = new Map(
    entriesOf(program).map((entry) => [
      entry.node.id,
      pinPartsOf(program, referenced, entry, context),
    ]),
  );
  const base = programSizes(program, input.density ?? 'touch', input.kinds);
  return { pins, sizes: sceneSizes(base, input.measured) };
}

function frameOf(input: GraphSceneInput): Pick<GraphScene, 'direction' | 'density'> {
  return { direction: input.direction, density: input.density ?? 'touch' };
}

function execFactsOf(program: ProgramV4, input: GraphSceneInput, kinds: NodeKindLookup): ExecFacts {
  const graph = execGraphOf(program, kinds);
  return { graph, membership: membershipOf(graph), pins: pinContext(program, input.names, kinds) };
}

export function projectGraphScene(program: ProgramV4, input: GraphSceneInput): GraphScene {
  const { kinds } = input;
  const outcome = structuredOf(program, kinds);
  const problems = outcome.kind === 'unstructured' ? outcome.problems : [];
  const exec = execFactsOf(program, input, kinds);
  const { membership } = exec;
  const idByKey = new Map(entriesOf(program).map((entry) => [entry.node.key, entry.node.id]));
  const startId = startIdOf(program, kinds);
  const sourceOf: SourceOf = (key) => (key === INPUTS_ROOT ? startId : idByKey.get(key));
  const requests = requestsOf(program, startId);
  const sized = sizedPins(program, input, referencedPorts(requests, sourceOf), exec.pins);
  const positions = positionsOf(program, input, sized.sizes);
  const placed = new Set(positions.keys());
  const nodeById = new Map(program.nodes.map((node) => [node.id, node]));
  const execEdges = withLanes(
    [
      ...triggersOf(program).flatMap((trigger) =>
        startId === undefined ? [] : [triggerEdge(trigger.id, startId)],
      ),
      ...execEdgesOf(program.nodes, (key) => idByKey.get(key), kinds),
    ].filter((edge) => placed.has(edge.source.nodeId) && placed.has(edge.target.nodeId)),
    exec,
    (id) => nodeById.get(id),
  );
  const split = splitProblems(problems, idByKey, execEdges);
  const facts: Facts = {
    program,
    exec,
    ...sized,
    positions,
    titles: titlesOf(program, membership.joinOf, input.functions),
    summaries: summariesOf(program, membership.joinOf),
    pairs: pairsOf(program, membership.joinOf),
    merges: countIncoming(execEdges),
    problems: withEntries(split.onNodes, input.problems ?? []),
  };
  const nodes = sceneNodesOf(facts, outcome, placed, kinds);
  const valueEdges = valueEdgesOf(requests, sourceOf, typeLookup(nodes)).filter(
    (edge) => placed.has(edge.source.nodeId) && placed.has(edge.target.nodeId),
  );
  return {
    version: 1,
    ...frameOf(input),
    ...extentOf(nodes),
    nodes,
    edges: [...markProblemEdges(execEdges, split.onEdges), ...valueEdges],
    unplaced: [...sized.sizes.keys()].filter((id) => !placed.has(id)),
    problems: [...problems.map(entryOf), ...(input.problems ?? [])],
  };
}
