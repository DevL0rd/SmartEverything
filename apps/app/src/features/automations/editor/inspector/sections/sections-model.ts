import type { FlowNode, GraphNode, NodeKind, NodePolicy } from '@smarteverything/domain';
import { durationText } from '@smarteverything/domain';
import { hasBehaviour } from './behaviour-model';
import { hasCalledInputs } from './called-inputs-model';
import { hasConnections } from './graph-connections-model';
import { FORK_KIND, JOIN_KIND } from './graph-paths-model';
import { rowKindOf } from './graph-row-model';
import { hasValuesAfter } from './graph-values-after-model';
import { TOOL_KIND, inputsModel, textFields } from './inputs-model';
import { forEachView, hasLoopLimits, isLimited, loopLimitView } from './loop-model';
import type { NodeView } from './node-view';
import { hasOnError } from './on-error-model';
import { hasRunMode, runModeOwnsTimeout } from './run-mode-model';
import { REUSABLE_CALL_KIND, flowNodeOf } from './node-view';
import type { InspectorEnv } from './section-types';

export const SECTION_IDS = [
  'header',
  'problems',
  'instance',
  'inputs',
  'calledInputs',
  'tool',
  'collect',
  'target',
  'return',
  'rows',
  'paths',
  'join',
  'valuesAfter',
  'outputs',
  'mode',
  'run',
  'connections',
  'onError',
  'naming',
  'timing',
  'behaviour',
  'limits',
  'together',
  'rawValues',
  'advanced',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export const INSPECTOR_ZONES = ['main', 'wiring', 'more'] as const;

export type InspectorZone = (typeof INSPECTOR_ZONES)[number];

export type InspectorLayout = Readonly<Record<InspectorZone, readonly SectionId[]>>;

const LOOP_EXIT_IDS: ReadonlySet<string> = new Set(['flow.break', 'flow.continue']);

interface Subject {
  readonly view: NodeView;
  readonly kind: NodeKind;
  readonly graph: GraphNode | undefined;
}

type Applies = (subject: Subject) => boolean;

function hasInputs({ view, kind }: Subject): boolean {
  return inputsModel(kind, view.node).rows.length > 0;
}

function hasTiming({ view, kind }: Subject): boolean {
  return inputsModel(kind, view.node, 'timing').rows.length > 0;
}

function onGraph(test: (node: GraphNode) => boolean): Applies {
  return ({ graph }) => graph !== undefined && test(graph);
}

function valuesGiven(node: GraphNode): boolean {
  return (node.outputs ?? []).length > 0;
}

function hasText({ view, kind }: Subject): boolean {
  return textFields(kind, view.node).length > 0;
}

const MAIN_RULES: readonly (readonly [SectionId, Applies])[] = [
  ['instance', ({ kind }): boolean => kind.id === REUSABLE_CALL_KIND],
  ['inputs', hasInputs],
  ['calledInputs', ({ kind }): boolean => hasCalledInputs(kind)],
  ['tool', ({ kind }): boolean => kind.id === TOOL_KIND],
  ['collect', ({ kind }): boolean => kind.id === 'flow.for_each'],
  ['target', ({ kind }): boolean => LOOP_EXIT_IDS.has(kind.id)],
  ['return', ({ kind }): boolean => kind.id === 'flow.return'],
  ['rows', onGraph((node) => rowKindOf(node) !== undefined)],
  ['paths', onGraph((node) => node.kind === FORK_KIND)],
  ['join', onGraph((node) => node.kind === JOIN_KIND)],
  ['valuesAfter', onGraph((node) => hasValuesAfter(node) && valuesGiven(node))],
  ['outputs', ({ kind }): boolean => kind.outputs.length > 0],
  ['mode', ({ kind }): boolean => hasRunMode(kind)],
];

const MORE_RULES: readonly (readonly [SectionId, Applies])[] = [
  ['timing', hasTiming],
  ['behaviour', ({ kind }): boolean => hasBehaviour(kind)],
  ['limits', ({ kind }): boolean => hasLoopLimits(kind)],
  ['together', ({ kind }): boolean => kind.id === 'flow.for_each'],
  ['valuesAfter', onGraph((node) => hasValuesAfter(node) && !valuesGiven(node))],
  ['rawValues', hasText],
];

function applying(
  rules: readonly (readonly [SectionId, Applies])[],
  subject: Subject | undefined,
): readonly SectionId[] {
  if (subject === undefined) return [];
  return rules.filter(([, applies]) => applies(subject)).map(([id]) => id);
}

function ordered(ids: readonly SectionId[]): readonly SectionId[] {
  return SECTION_IDS.filter((id) => ids.includes(id));
}

function wiringOf(graph: GraphNode, env: InspectorEnv): readonly SectionId[] {
  return [
    ...(hasConnections(graph, env.registry) ? (['connections'] as const) : []),
    ...(hasOnError(graph.kind, env.registry) ? (['onError'] as const) : []),
  ];
}

export function inspectorLayout(view: NodeView, env: InspectorEnv): InspectorLayout {
  const graph = env.graph.nodes.find((node) => node.id === view.id);
  const subject = view.kind === undefined ? undefined : { view, kind: view.kind, graph };
  const main: SectionId[] = [
    'header',
    ...(env.findings.length > 0 ? (['problems'] as const) : []),
    ...applying(MAIN_RULES, subject),
    ...(env.run === null ? [] : (['run'] as const)),
  ];
  const wiring: readonly SectionId[] = graph === undefined ? [] : wiringOf(graph, env);
  const more: SectionId[] = ['naming', ...applying(MORE_RULES, subject), 'advanced'];
  return { main: ordered(main), wiring, more: ordered(more) };
}

export function sectionsFor(view: NodeView, env: InspectorEnv): readonly SectionId[] {
  const layout = inspectorLayout(view, env);
  return INSPECTOR_ZONES.flatMap((zone) => layout[zone]);
}

const ON_ERROR_TEXT: Readonly<Record<NonNullable<NodePolicy['onError']>, string>> = {
  fail: 'Stop the run on failure',
  continue: 'Carry on after a failure',
  route: 'Follow If it fails',
};

function policyParts(node: FlowNode | undefined, kind: NodeKind | undefined): readonly string[] {
  const policy = node?.policy;
  if (policy === undefined) return [];
  const timeout = runModeOwnsTimeout(kind, policy) ? undefined : policy.timeout;
  return [
    ...(policy.onError === undefined ? [] : [ON_ERROR_TEXT[policy.onError]]),
    ...(policy.retry === undefined ? [] : ['Retries']),
    ...(timeout === undefined ? [] : [`Time limit ${durationText(timeout)}`]),
    ...(policy.acknowledgeRepeat === true ? ['Safe to run twice'] : []),
  ];
}

function timingSet(view: NodeView): readonly string[] {
  if (view.kind === undefined) return [];
  return inputsModel(view.kind, view.node, 'timing')
    .rows.filter((row) => row.value !== undefined)
    .map((row) => row.field.title);
}

function limitSet(view: NodeView): boolean {
  const { kind } = view;
  const node = flowNodeOf(view);
  if (kind === undefined || node === undefined) return false;
  if (kind.id === 'flow.for_each') return forEachView(node, kind).together;
  return hasLoopLimits(kind) && isLimited(loopLimitView(node, kind.id));
}

export const MORE_OPTIONS_HINT = 'Name, note, when it fails, limits and more';

export function moreOptionsSet(view: NodeView, freePosition: boolean): readonly string[] {
  const { node } = view;
  const note = node.note ?? '';
  const label = node.label ?? '';
  return [
    ...(label.trim() === '' ? [] : ['Name']),
    ...(note.trim() === '' ? [] : ['Note']),
    ...timingSet(view),
    ...policyParts(flowNodeOf(view), view.kind),
    ...(limitSet(view) ? ['Limits'] : []),
    ...(node.enabled === false ? ['Off'] : []),
    ...(freePosition ? ['Kept where dropped'] : []),
  ];
}
