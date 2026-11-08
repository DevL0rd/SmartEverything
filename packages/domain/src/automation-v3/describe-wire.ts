import { humanizeKey } from '../presentation/humanize';
import { lowerFirst, outputLabel, referenceLabel } from './describe-context';
import type { Wire } from './port-value';

export interface WireStep {
  readonly label: string;
  readonly output: (name: string) => string;
  readonly whole?: (name: string) => boolean;
}

export interface WireScope {
  readonly step: (key: string) => WireStep | undefined;
  readonly variable: (name: string) => string | undefined;
  readonly input: (name: string) => string | undefined;
  readonly trigger: WireStep;
  readonly spoken?: boolean;
}

type RootRule = (port: string, scope: WireScope) => string;

function spokenReference(step: string, output: string): string {
  return `the ${lowerFirst(output)} from ${lowerFirst(step)}`;
}

function reference(scope: WireScope, step: string, output: string): string {
  return scope.spoken === true ? spokenReference(step, output) : referenceLabel(step, output);
}

function stepReference(scope: WireScope, step: WireStep, port: string): string {
  return scope.spoken === true && step.whole?.(port) === true
    ? lowerFirst(step.label)
    : reference(scope, step.label, step.output(port));
}

const ROOT_RULES: ReadonlyMap<string, RootRule> = new Map([
  ['vars', (port, scope): string => `${scope.variable(port) ?? humanizeKey(port)} (variable)`],
  ['inputs', (port, scope): string => `${scope.input(port) ?? humanizeKey(port)} (input)`],
  ['home', (port, scope): string => reference(scope, 'Home', humanizeKey(port))],
  ['run', (port, scope): string => reference(scope, 'This run', humanizeKey(port))],
  ['trigger', (port, scope): string => stepReference(scope, scope.trigger, port)],
]);

export function plainWire(wire: Wire, scope: WireScope): string {
  const root = ROOT_RULES.get(wire.from);
  if (root !== undefined) return root(wire.port, scope);
  const step = scope.step(wire.from);
  return step === undefined
    ? reference(scope, humanizeKey(wire.from), humanizeKey(wire.port))
    : stepReference(scope, step, wire.port);
}

export function plainStep(label: string, whole?: (name: string) => boolean): WireStep {
  return whole === undefined
    ? { label, output: outputLabel }
    : { label, output: outputLabel, whole };
}
