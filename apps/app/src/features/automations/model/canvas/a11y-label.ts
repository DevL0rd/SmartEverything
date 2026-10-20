import type { Problem, RunNode } from './contract';

export interface LabelSpec {
  readonly role: 'trigger' | 'step' | 'container' | 'value';
  readonly title: string;
  readonly subtitle: string;
  readonly category: string;
  readonly ordinal: number;
  readonly total: number;
  readonly path: readonly string[];
  readonly lanes: readonly string[];
  readonly inputs: readonly string[];
  readonly problem: Problem | null;
  readonly consumer: string | null;
  readonly run: RunNode | null;
}

const PROBLEM_WORD = { critical: 'Problem', warning: 'Warning' } as const;

function inputsPart(inputs: readonly string[]): string {
  return inputs.length === 0 ? '' : `. Inputs: ${inputs.join('; ')}`;
}

function problemPart(problem: Problem | null): string {
  return problem === null ? '' : `. ${PROBLEM_WORD[problem.severity]}: ${problem.message}`;
}

function lanesPart(lanes: readonly string[]): string {
  if (lanes.length === 0) return '';
  const noun = lanes.length === 1 ? 'branch' : 'branches';
  return `. Block with ${String(lanes.length)} ${noun}: ${lanes.join(', ')}`;
}

const RUN_PHRASES: Readonly<Record<RunNode['state'], (text: string | null) => string>> = {
  running: () => '. Running',
  done: (text) => (text === null ? '. Done' : `. Done, result ${text}`),
  failed: (text) => (text === null ? '. Failed' : `. Failed: ${text}`),
  skipped: () => '. Skipped',
  waiting: (text) => (text === null ? '. Waiting' : `. Waiting, ${text}`),
};

export function runPhrase(run: RunNode | null): string {
  if (run === null) return '';
  const text = run.text === undefined || run.text === '' ? null : run.text;
  return RUN_PHRASES[run.state](text);
}

function valueLabel(spec: LabelSpec): string {
  const lead = spec.consumer === null ? 'Value' : `Value used by ${spec.consumer}`;
  return `${lead}, ${spec.title}, ${spec.subtitle}${inputsPart(spec.inputs)}`;
}

function triggerLabel(spec: LabelSpec): string {
  const head = `Trigger ${String(spec.ordinal)} of ${String(spec.total)}, ${spec.title}`;
  return `${head}, ${spec.subtitle}`;
}

function stepLabel(spec: LabelSpec): string {
  const where = spec.path.length === 0 ? '' : `, in ${spec.path.join(', ')}`;
  const head = `Step ${String(spec.ordinal)} of ${String(spec.total)}, ${spec.title}, ${spec.category}`;
  return `${head}${where}${lanesPart(spec.lanes)}${inputsPart(spec.inputs)}${problemPart(spec.problem)}`;
}

export function a11yLabel(spec: LabelSpec): string {
  const base =
    spec.role === 'value'
      ? valueLabel(spec)
      : spec.role === 'trigger'
        ? triggerLabel(spec)
        : stepLabel(spec);
  return `${base}${runPhrase(spec.run)}`;
}

export function slotLabel(label: string): string {
  return `Empty slot. ${label}`;
}

export function admitLabel(text: string): string {
  return `Only run if ${text}`;
}

export function triggerGroupLabel(count: number): string {
  return `Triggers. Any of these ${String(count)} starts the automation`;
}

export function canvasLabel(total: number): string {
  return `Automation canvas, ${String(total)} ${total === 1 ? 'step' : 'steps'}. Tab moves between steps.`;
}
