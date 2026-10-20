import fc from 'fast-check';
import type {
  AutomationV3,
  FlowNode,
  FunctionV3,
  RunPolicy,
  Scope,
  TriggerNode,
} from '../../src/automation-v3';

type Shape =
  | { readonly t: 'leaf'; readonly kind: string }
  | {
      readonly t: 'if';
      readonly branches: readonly (readonly Shape[])[];
      readonly other: readonly Shape[] | undefined;
    }
  | { readonly t: 'switch'; readonly cases: readonly (readonly Shape[])[] }
  | { readonly t: 'loop'; readonly body: readonly Shape[] }
  | { readonly t: 'try'; readonly body: readonly Shape[]; readonly caught: readonly Shape[] }
  | { readonly t: 'parallel'; readonly branches: readonly (readonly Shape[])[] };

const LEAF_KINDS = ['device.set', 'notify.feed', 'math.add', 'flow.wait'] as const;

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function shapeList(depth: number): fc.Arbitrary<readonly Shape[]> {
  return fc.array(shape(depth), { maxLength: 3 });
}

function shape(depth: number): fc.Arbitrary<Shape> {
  const leaf = fc.constantFrom(...LEAF_KINDS).map((kind): Shape => ({ t: 'leaf', kind }));
  if (depth <= 0) return leaf;
  const inner = shapeList(depth - 1);
  return fc.oneof(
    leaf,
    fc.record({
      t: fc.constant('if' as const),
      branches: fc.array(inner, { minLength: 1, maxLength: 2 }),
      other: fc.option(inner, { nil: undefined }),
    }),
    fc.record({
      t: fc.constant('switch' as const),
      cases: fc.array(inner, { minLength: 1, maxLength: 2 }),
    }),
    fc.record({ t: fc.constant('loop' as const), body: inner }),
    fc.record({ t: fc.constant('try' as const), body: inner, caught: inner }),
    fc.record({
      t: fc.constant('parallel' as const),
      branches: fc.array(inner, { minLength: 2, maxLength: 3 }),
    }),
  );
}

type Counter = () => number;

function counterFrom(start: number): Counter {
  let current = start;
  return () => {
    const issued = current;
    current += 1;
    return issued;
  };
}

function stamp(counter: Counter, kind: string): Pick<FlowNode, 'id' | 'key' | 'kind'> {
  const index = counter();
  return { id: uuid(index), key: `n${String(index)}`, kind };
}

function scopeOf(counter: Counter, shapes: readonly Shape[]): Scope {
  return { nodes: shapes.map((entry) => nodeOf(counter, entry)) };
}

function namedScopes(
  counter: Counter,
  prefix: string,
  lists: readonly (readonly Shape[])[],
): Record<string, Scope> {
  return Object.fromEntries(
    lists.map((list, index) => [`${prefix}${String(index)}`, scopeOf(counter, list)]),
  );
}

function nodeOf(counter: Counter, entry: Shape): FlowNode {
  switch (entry.t) {
    case 'leaf':
      return { ...stamp(counter, entry.kind), ports: { value: { lit: 1 } } };
    case 'if': {
      const base = stamp(counter, 'flow.if');
      return {
        ...base,
        branches: entry.branches.map((list) => ({
          id: uuid(counter()),
          when: { lit: true },
          scope: scopeOf(counter, list),
        })),
        ...(entry.other === undefined ? {} : { scopes: { else: scopeOf(counter, entry.other) } }),
      };
    }
    case 'switch': {
      const base = stamp(counter, 'flow.switch');
      return {
        ...base,
        ports: { subject: { wire: { from: 'trigger', port: 'key' } } },
        cases: entry.cases.map((list, index) => ({
          id: uuid(counter()),
          match: { eq: index },
          scope: scopeOf(counter, list),
        })),
      };
    }
    case 'loop':
      return {
        ...stamp(counter, 'flow.repeat'),
        ports: { times: { lit: 2 } },
        scopes: { body: scopeOf(counter, entry.body) },
      };
    case 'try':
      return {
        ...stamp(counter, 'flow.try'),
        scopes: { try: scopeOf(counter, entry.body) },
        catches: [{ id: uuid(counter()), scope: scopeOf(counter, entry.caught) }],
      };
    case 'parallel':
      return {
        ...stamp(counter, 'flow.parallel'),
        scopes: namedScopes(counter, 'b', entry.branches),
      };
  }
}

const bodies = shapeList(2);

const runPolicies: fc.Arbitrary<RunPolicy> = fc.oneof(
  fc.constantFrom<RunPolicy>({ mode: 'single' }, { mode: 'restart', timeout: 60_000 }),
  fc
    .record({
      mode: fc.constant('queue' as const),
      max: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
      maxWait: fc.option(fc.integer({ min: 1, max: 600_000 }), { nil: undefined }),
    })
    .map(({ mode, max, maxWait }) => ({
      mode,
      ...(max === undefined ? {} : { max }),
      ...(maxWait === undefined ? {} : { maxWait }),
    })),
  fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }).map((max) => ({
    mode: 'parallel' as const,
    ...(max === undefined ? {} : { max }),
  })),
);

function triggerOf(index: number): TriggerNode {
  return {
    id: uuid(index),
    key: `t${String(index)}`,
    kind: 'trigger.time',
    ports: { at: { lit: '07:00' } },
  };
}

const triggerCount = fc.integer({ min: 0, max: 2 });

export const automationV3: fc.Arbitrary<AutomationV3> = fc
  .tuple(bodies, runPolicies, triggerCount, fc.boolean(), fc.boolean())
  .map(([body, policy, triggers, persist, withFailure]) => {
    const counter = counterFrom(1000);
    return {
      version: 3,
      kind: 'automation',
      triggers: Array.from({ length: triggers }, (_, index) => triggerOf(index + 1)),
      inputs: [{ name: 'level', type: { t: 'number' }, required: triggers === 0 }],
      outputs: [{ name: 'done', type: { t: 'boolean' } }],
      variables: [
        { name: 'count', type: { t: 'number' }, initial: { lit: 0 }, persist },
        { name: 'note', type: { t: 'text' }, initial: { lit: '' } },
      ],
      body: scopeOf(counter, body),
      ...(withFailure ? { onFailure: scopeOf(counter, [{ t: 'leaf', kind: 'notify.feed' }]) } : {}),
      policy,
    };
  });

export const functionV3: fc.Arbitrary<FunctionV3> = fc
  .tuple(bodies, fc.constantFrom('pure', 'action'))
  .map(([body, flavour]) => {
    const counter = counterFrom(1000);
    return {
      version: 3,
      kind: 'function',
      flavour,
      inputs: [{ name: 'level', type: { t: 'number' }, required: true }],
      outputs: [{ name: 'result', type: { t: 'number' } }],
      exits: ['done', 'failed'],
      variables: [{ name: 'count', type: { t: 'number' }, initial: { lit: 0 } }],
      body: scopeOf(counter, body),
    };
  });

const DEFECT_INDEX = 9000;

function extra(kind: string, index: number, shape: Partial<FlowNode> = {}): FlowNode {
  return { id: uuid(DEFECT_INDEX + index), key: `bad${String(index)}`, kind, ...shape };
}

function withNodes<T extends AutomationV3 | FunctionV3>(program: T, nodes: readonly FlowNode[]): T {
  return { ...program, body: { nodes: [...program.body.nodes, ...nodes] } };
}

export interface Defect<T> {
  readonly name: string;
  readonly message: string;
  readonly apply: (program: T) => T;
}

const emptyScope: Scope = { nodes: [] };

export const AUTOMATION_DEFECTS: readonly Defect<AutomationV3>[] = [
  {
    name: 'repeated key',
    message: 'key "same" is used more than once',
    apply: (p) =>
      withNodes(p, [
        { ...extra('device.set', 1), key: 'same' },
        { ...extra('device.set', 2), key: 'same' },
      ]),
  },
  {
    name: 'repeated id',
    message: 'is used more than once',
    apply: (p) =>
      withNodes(p, [
        extra('device.set', 1),
        { ...extra('device.set', 2), id: uuid(DEFECT_INDEX + 1) },
      ]),
  },
  {
    name: 'branches on a plain node',
    message: 'branches belong to flow.if',
    apply: (p) =>
      withNodes(p, [
        extra('device.set', 1, {
          branches: [{ id: uuid(DEFECT_INDEX + 50), when: { lit: true }, scope: emptyScope }],
        }),
      ]),
  },
  {
    name: 'if without branches',
    message: 'flow.if needs them',
    apply: (p) => withNodes(p, [extra('flow.if', 1)]),
  },
  {
    name: 'cases on a plain node',
    message: 'cases belong to flow.switch',
    apply: (p) =>
      withNodes(p, [
        extra('device.set', 1, {
          cases: [{ id: uuid(DEFECT_INDEX + 50), match: { eq: 1 }, scope: emptyScope }],
        }),
      ]),
  },
  {
    name: 'catches on a plain node',
    message: 'catches belong to flow.try only',
    apply: (p) =>
      withNodes(p, [
        extra('device.set', 1, { catches: [{ id: uuid(DEFECT_INDEX + 50), scope: emptyScope }] }),
      ]),
  },
  {
    name: 'outputs on a plain node',
    message: 'structured outputs belong to',
    apply: (p) =>
      withNodes(p, [
        extra('device.set', 1, { outputs: [{ name: 'out', values: { body: { lit: 1 } } }] }),
      ]),
  },
  {
    name: 'pin on a plain node',
    message: 'a pin belongs to fn.call only',
    apply: (p) => withNodes(p, [extra('device.set', 1, { pin: { revision: 1 } })]),
  },
  {
    name: 'unknown loop scope',
    message: 'is not one of: body',
    apply: (p) =>
      withNodes(p, [extra('flow.repeat', 1, { scopes: { body: emptyScope, extra: emptyScope } })]),
  },
  {
    name: 'try without its scope',
    message: 'the scope "try" is required',
    apply: (p) => withNodes(p, [extra('flow.try', 1)]),
  },
  {
    name: 'parallel with one branch',
    message: 'at least 2 scopes are needed',
    apply: (p) => withNodes(p, [extra('flow.parallel', 1, { scopes: { b0: emptyScope } })]),
  },
  {
    name: 'error scope without route',
    message: 'needs the node policy onError "route"',
    apply: (p) => withNodes(p, [extra('device.set', 1, { scopes: { onError: emptyScope } })]),
  },
  {
    name: 'trigger in the body',
    message: 'a trigger belongs in the triggers',
    apply: (p) => withNodes(p, [extra('trigger.time', 1)]),
  },
  {
    name: 'max on single',
    message: 'max belongs to the queue and parallel modes',
    apply: (p) => ({ ...p, policy: { mode: 'single', max: 3 } }),
  },
  {
    name: 'maxWait on parallel',
    message: 'maxWait belongs to the queue mode',
    apply: (p) => ({ ...p, policy: { mode: 'parallel', maxWait: 1000 } }),
  },
  {
    name: 'required input with triggers',
    message: 'needs a default when triggers start the run',
    apply: (p) => ({
      ...p,
      triggers: [triggerOf(DEFECT_INDEX + 90)],
      inputs: [{ name: 'needed', type: { t: 'number' }, required: true }],
    }),
  },
  {
    name: 'repeated variable name',
    message: 'variable "count" is used more than once',
    apply: (p) => ({
      ...p,
      variables: [
        { name: 'count', type: { t: 'number' }, initial: { lit: 0 } },
        { name: 'count', type: { t: 'number' }, initial: { lit: 1 } },
      ],
    }),
  },
];

export const FUNCTION_DEFECTS: readonly Defect<FunctionV3>[] = [
  {
    name: 'stateful node',
    message: 'keeps memory and cannot sit inside a Custom Node',
    apply: (p) => withNodes(p, [extra('state.counter', 1)]),
  },
  {
    name: 'kept data in a calculation',
    message: 'only an action Custom Node can keep data between runs',
    apply: (p) => ({
      ...p,
      flavour: 'pure',
      variables: [{ name: 'kept', type: { t: 'number' }, initial: { lit: 0 }, persist: true }],
    }),
  },
  {
    name: 'repeated exit',
    message: 'exit "done" is used more than once',
    apply: (p) => ({ ...p, exits: ['done', 'done'] }),
  },
  {
    name: 'trigger in the body',
    message: 'a trigger belongs in the triggers',
    apply: (p) => withNodes(p, [extra('trigger.time', 1)]),
  },
];

export const invalidAutomation: fc.Arbitrary<{
  readonly defect: Defect<AutomationV3>;
  readonly program: AutomationV3;
}> = fc
  .tuple(automationV3, fc.constantFrom(...AUTOMATION_DEFECTS))
  .map(([program, defect]) => ({ defect, program: defect.apply(program) }));

export const invalidFunction: fc.Arbitrary<{
  readonly defect: Defect<FunctionV3>;
  readonly program: FunctionV3;
}> = fc
  .tuple(functionV3, fc.constantFrom(...FUNCTION_DEFECTS))
  .map(([program, defect]) => ({ defect, program: defect.apply(program) }));
