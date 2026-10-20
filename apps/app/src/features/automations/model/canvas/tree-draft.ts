import type { FlowNode, InputPort, TriggerNode } from '@smarteverything/domain';
import { nodeSummaryText, typeDisplayName } from '@smarteverything/domain';
import { a11yLabel, admitLabel, slotLabel, triggerGroupLabel } from './a11y-label';
import type { Problem, RunNode, ScenePort } from './contract';
import type { Draft, Env, KindView } from './tree-env';
import { CUSTOM_NODE_OVERLINE, FUNCTION_CALL_KIND, calledFunction, titleOf } from './tree-env';
import { describePort, labelOf, pinsOf, shapeOf } from './tree-ports';

export interface Placement {
  readonly depth: number;
  readonly path: readonly string[];
  readonly feeds: string | null;
  readonly consumer: string | null;
  readonly unused: boolean;
  readonly collapsed: boolean;
  readonly hiddenCount: number;
  readonly lanes: readonly string[];
}

const BASE: Omit<Draft, 'id' | 'role' | 'title' | 'ariaLabel'> = {
  kind: null,
  subtitle: '',
  overline: null,
  icon: 'layers',
  category: 'flow',
  ordinal: null,
  depth: 0,
  enabled: true,
  collapsed: false,
  opensBody: false,
  unused: false,
  feeds: null,
  revision: null,
  updateAvailable: false,
  hiddenCount: 0,
  chip: null,
  pills: [],
  ports: [],
  outputs: [],
  problems: [],
  run: null,
};

export function problemsOf(env: Env, id: string, kind: KindView): readonly Problem[] {
  const given = (env.problems.get(id) ?? []).map((problem) => ({
    severity: problem.severity,
    message: problem.message,
    port: problem.port ?? null,
  }));
  if (kind.known) return given;
  return [{ severity: 'critical', message: `Unknown step ${kind.id}`, port: null }, ...given];
}

function portsOf(env: Env, node: FlowNode | TriggerNode, kind: KindView): readonly ScenePort[] {
  const problems = env.problems.get(node.id) ?? [];
  return Object.entries(node.ports ?? {}).map(([name, value]) =>
    describePort(env, {
      name,
      value,
      decl: kind.inputs.find((decl) => decl.name === name),
      problems,
    }),
  );
}

function inputText(port: ScenePort): string {
  const head = port.wired ? `${port.label} from` : port.label;
  return `${head} ${port.value ?? ''}`.trim();
}

function revisionOf(env: Env, node: FlowNode): { revision: number | null; update: boolean } {
  const info = calledFunction(env.options, node);
  if (node.kind !== FUNCTION_CALL_KIND) return { revision: null, update: false };
  const pinned = node.pin?.revision;
  const update = pinned !== undefined && info !== undefined && info.latest > pinned;
  return { revision: pinned ?? info?.latest ?? null, update };
}

function subtitleOf(env: Env, node: FlowNode | TriggerNode): string {
  return nodeSummaryText(node, env.describe, env.scope);
}

export interface StepSubject {
  readonly node: FlowNode;
  readonly kind: KindView;
  readonly role: 'step' | 'container' | 'value';
}

interface Facts {
  readonly title: string;
  readonly subtitle: string;
  readonly ports: readonly ScenePort[];
  readonly problems: readonly Problem[];
  readonly run: RunNode | null;
}

function labelOfStep(env: Env, subject: StepSubject, where: Placement, facts: Facts): string {
  return a11yLabel({
    role: subject.role,
    title: facts.title,
    subtitle: facts.subtitle,
    category: subject.kind.category,
    ordinal: env.ordinals.get(subject.node.id) ?? 1,
    total: env.total,
    path: where.path,
    lanes: where.lanes,
    inputs: facts.ports.map(inputText),
    problem: facts.problems[0] ?? null,
    consumer: where.unused ? null : where.consumer,
    run: facts.run,
  });
}

export function stepDraft(env: Env, subject: StepSubject, where: Placement): Draft {
  const { node, kind, role } = subject;
  const facts: Facts = {
    title: titleOf(env.options, node),
    subtitle: subtitleOf(env, node),
    ports: portsOf(env, node, kind),
    problems: problemsOf(env, node.id, kind),
    run: env.options.run?.[node.id] ?? null,
  };
  const { revision, update } = revisionOf(env, node);
  return {
    ...BASE,
    id: node.id,
    role,
    kind: node.kind,
    title: facts.title,
    subtitle: facts.subtitle,
    overline: node.kind === FUNCTION_CALL_KIND ? CUSTOM_NODE_OVERLINE : null,
    icon: kind.icon,
    category: kind.categoryId,
    ordinal: env.ordinals.get(node.id) ?? null,
    depth: where.depth,
    enabled: node.enabled !== false,
    collapsed: where.collapsed,
    unused: where.unused,
    feeds: where.feeds,
    revision,
    updateAvailable: update,
    hiddenCount: where.hiddenCount,
    pills: (node.outputs ?? []).map((output) => output.name),
    ports: [...facts.ports],
    outputs: [...pinsOf(kind)],
    problems: [...facts.problems],
    run: facts.run,
    ariaLabel: labelOfStep(env, subject, where, facts),
  };
}

export function triggerDraft(env: Env, node: TriggerNode, index: number, count: number): Draft {
  const kind = env.kinds(node.kind);
  const title = titleOf(env.options, node);
  const subtitle = subtitleOf(env, node);
  const run = env.options.run?.[node.id] ?? null;
  return {
    ...BASE,
    id: node.id,
    role: 'trigger',
    kind: node.kind,
    title,
    subtitle,
    overline: 'Trigger',
    icon: kind.icon,
    category: kind.categoryId,
    ordinal: index + 1,
    enabled: node.enabled !== false,
    ports: [...portsOf(env, node, kind)],
    outputs: [...pinsOf(kind)],
    problems: [...problemsOf(env, node.id, kind)],
    run,
    ariaLabel: a11yLabel({
      role: 'trigger',
      title,
      subtitle,
      category: kind.category,
      ordinal: index + 1,
      total: count,
      path: [],
      lanes: [],
      inputs: [],
      problem: null,
      consumer: null,
      run,
    }),
  };
}

export function laneDraft(
  id: string,
  role: 'lane' | 'failure',
  text: {
    title: string;
    chip: string | null;
    pills: readonly string[];
    pins: readonly string[];
    collapsed: boolean;
    hiddenCount: number;
    depth: number;
  },
): Draft {
  return {
    ...BASE,
    id,
    role,
    title: text.title,
    chip: text.chip,
    pills: [...text.pills],
    collapsed: text.collapsed,
    hiddenCount: text.hiddenCount,
    depth: text.depth,
    outputs: text.pins.map((name) => ({
      name,
      label: labelOf(name),
      shape: 'circle',
      type: 'Value',
      direction: 'out',
      value: null,
      wired: false,
      problem: false,
    })),
    ariaLabel: `Lane ${text.title}`,
  };
}

export function slotDraft(laneId: string, depth: number): Draft {
  return {
    ...BASE,
    id: `slot:${laneId}`,
    role: 'slot',
    title: 'Add a step',
    icon: 'plus',
    depth,
    ariaLabel: slotLabel('Add a step'),
  };
}

export function admitDraft(env: Env, text: string): Draft {
  return {
    ...BASE,
    id: 'admit',
    role: 'admit',
    title: 'Only run if',
    subtitle: text,
    icon: 'shield-check',
    ariaLabel: admitLabel(text),
    problems: [...(env.problems.get('admit') ?? []).map(toProblem)],
  };
}

function toProblem(problem: {
  severity: Problem['severity'];
  message: string;
  port?: string | undefined;
}): Problem {
  return { severity: problem.severity, message: problem.message, port: problem.port ?? null };
}

export const TRIGGER_GROUP_ID = 'triggers';

export function groupDraft(count: number): Draft {
  return {
    ...BASE,
    id: TRIGGER_GROUP_ID,
    role: 'triggerGroup',
    title: 'When any of these happens',
    icon: 'zap',
    category: 'triggers',
    ariaLabel: triggerGroupLabel(count),
  };
}

function inputPin(port: InputPort): ScenePort {
  return {
    name: port.name,
    label: port.label ?? labelOf(port.name),
    shape: shapeOf(port.type),
    type: typeDisplayName(port.type),
    direction: 'out',
    value: null,
    wired: false,
    problem: false,
  };
}

export function inputsDraft(inputs: readonly InputPort[]): Draft {
  return {
    ...BASE,
    id: 'inputs',
    role: 'inputs',
    title: 'Inputs',
    subtitle: `${String(inputs.length)} ${inputs.length === 1 ? 'input' : 'inputs'}`,
    icon: 'log-in',
    outputs: inputs.map(inputPin),
    ariaLabel: `Inputs of this Custom Node: ${inputs.map((port) => port.label ?? port.name).join(', ') || 'none'}`,
  };
}

export function exitsDraft(exits: readonly string[]): Draft {
  return {
    ...BASE,
    id: 'exits',
    role: 'exits',
    title: 'Exits',
    subtitle: exits.join(', '),
    icon: 'log-out',
    ports: exits.map((name) => ({
      name,
      label: labelOf(name),
      shape: 'circle',
      type: 'Exit',
      direction: 'in',
      value: null,
      wired: false,
      problem: false,
    })),
    ariaLabel: `Exits of this Custom Node: ${exits.join(', ')}`,
  };
}
