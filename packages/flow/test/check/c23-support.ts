import type {
  AutomationV3,
  FlowNode,
  FunctionV3,
  JsonValue,
  PortValue,
  Scope,
  TriggerNode,
} from '@smarteverything/domain';
import { NODE_REGISTRY, defineNodeKind } from '@smarteverything/domain';
import type { OutputPortDecl } from '@smarteverything/domain';
import type { AutomationInterface, CheckContext, CheckKind } from '../../src/check/check';
import type { FunctionInterface } from '../../src/functions/interface-hash';

let counter = 0;

export function uuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

export const lit = (value: JsonValue): PortValue => ({ lit: value });
export const wired = (reference: string): PortValue => {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
};

export function node(
  key: string,
  kind: string,
  ports: Record<string, PortValue> = {},
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { id: uuid(), key, kind, ports, ...extra };
}

export function trigger(
  key: string,
  kind: string,
  ports: Record<string, PortValue> = {},
  extra: Partial<TriggerNode> = {},
): TriggerNode {
  return { id: uuid(), key, kind, ports, ...extra };
}

export function scope(...nodes: FlowNode[]): Scope {
  return { nodes };
}

export function automation(
  body: readonly FlowNode[],
  extra: Partial<AutomationV3> = {},
): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...body] },
    policy: { mode: 'single' },
    ...extra,
  };
}

export function functionProgram(
  body: readonly FlowNode[],
  extra: Partial<FunctionV3> = {},
): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    body: { nodes: [...body] },
    ...extra,
  };
}

const INDEX: OutputPortDecl = {
  name: 'index',
  type: { t: 'number', integer: true, min: 0 },
  description: 'The pass number.',
};

const SCOPE_OUTPUTS: Readonly<Record<string, readonly OutputPortDecl[]>> = {
  'flow.for_each': [
    { name: 'item', type: { t: 'param', name: 'item' }, description: 'The current item.' },
    INDEX,
  ],
  'flow.repeat': [INDEX],
  'flow.try': [{ name: 'error', type: { t: 'error' }, description: 'The error.' }],
};

export const PROBE = defineNodeKind({
  id: 'probe.take',
  name: 'Probe',
  category: 'debug',
  icon: 'bug',
  class: 'effect',
  description: 'Takes typed ports for checks.',
  inputs: [
    {
      name: 'count',
      type: { t: 'number', integer: true, min: 0, max: 9 },
      required: false,
      description: 'A count.',
    },
    { name: 'label', type: { t: 'text' }, required: false, description: 'A label.' },
    { name: 'flag', type: { t: 'boolean' }, required: false, description: 'A flag.' },
    { name: 'wait', type: { t: 'duration' }, required: false, description: 'A wait.' },
    {
      name: 'fixed',
      type: { t: 'text' },
      required: false,
      static: true,
      description: 'A fixed text.',
    },
    { name: 'at', type: { t: 'timeOfDay' }, required: false, description: 'A time.' },
    {
      name: 'pick',
      type: {
        t: 'choice',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
      required: false,
      description: 'A choice.',
    },
    { name: 'room', type: { t: 'ref', of: 'room' }, required: false, description: 'A room.' },
    { name: 'target', type: { t: 'ref', of: 'target' }, required: false, description: 'A target.' },
    { name: 'need', type: { t: 'text' }, required: true, description: 'A required text.' },
  ],
  outputs: [{ name: 'out', type: { t: 'number', integer: true }, description: 'A number.' }],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'none' },
  summary: 'Probe',
  keywords: ['probe'],
  access: 'member',
  tier: 'v1',
});

const EXTRA_KINDS = new Map<string, CheckKind>([[PROBE.id, PROBE]]);

export interface ContextOptions {
  readonly known?: ReadonlySet<string>;
  readonly secrets?: readonly string[];
  readonly functions?: Readonly<Record<string, FunctionInterface>>;
  readonly revisions?: Readonly<Record<string, readonly number[]>>;
  readonly automations?: Readonly<Record<string, AutomationInterface>>;
}

export function context(options: ContextOptions = {}): CheckContext {
  const known = options.known ?? new Set<string>();
  return {
    kinds: (id) => EXTRA_KINDS.get(id) ?? NODE_REGISTRY.get(id),
    scopeOutputs: (kind) => SCOPE_OUTPUTS[kind] ?? [],
    references: (_kind, id) => known.has(id),
    functions: (id, pin): FunctionInterface | undefined => {
      const found = options.functions?.[id];
      if (found === undefined) return undefined;
      const revisions = options.revisions?.[id];
      return pin === undefined || revisions === undefined || revisions.includes(pin)
        ? found
        : undefined;
    },
    secrets: new Set(options.secrets ?? []),
    automations: (id) => options.automations?.[id],
  };
}
