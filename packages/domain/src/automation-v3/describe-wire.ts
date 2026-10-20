import { humanizeKey } from '../presentation/humanize';
import { outputLabel, referenceLabel } from './describe-context';
import type { Wire } from './port-value';

export interface WireStep {
  readonly label: string;
  readonly output: (name: string) => string;
}

export interface WireScope {
  readonly step: (key: string) => WireStep | undefined;
  readonly variable: (name: string) => string | undefined;
  readonly input: (name: string) => string | undefined;
  readonly trigger: WireStep;
}

type RootRule = (port: string, scope: WireScope) => string;

const ROOT_RULES: ReadonlyMap<string, RootRule> = new Map([
  ['vars', (port, scope): string => `${scope.variable(port) ?? humanizeKey(port)} (variable)`],
  ['inputs', (port, scope): string => `${scope.input(port) ?? humanizeKey(port)} (input)`],
  ['home', (port): string => referenceLabel('Home', humanizeKey(port))],
  ['run', (port): string => referenceLabel('This run', humanizeKey(port))],
  [
    'trigger',
    (port, scope): string => referenceLabel(scope.trigger.label, scope.trigger.output(port)),
  ],
]);

export function plainWire(wire: Wire, scope: WireScope): string {
  const root = ROOT_RULES.get(wire.from);
  if (root !== undefined) return root(wire.port, scope);
  const step = scope.step(wire.from);
  return step === undefined
    ? referenceLabel(humanizeKey(wire.from), humanizeKey(wire.port))
    : referenceLabel(step.label, step.output(wire.port));
}

export function plainStep(label: string): WireStep {
  return { label, output: outputLabel };
}
