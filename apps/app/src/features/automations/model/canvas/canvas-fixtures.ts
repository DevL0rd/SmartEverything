import fc from 'fast-check';
import type {
  AutomationV3,
  FlowNode,
  FunctionV3,
  PortValue,
  Scope,
  TriggerNode,
} from '@smarteverything/domain';
import { EMPTY_LAYOUT, NODE_REGISTRY } from '@smarteverything/domain';
import type { SceneInput } from './project-scene';

export const WIDE: SceneInput = { registry: NODE_REGISTRY, layout: EMPTY_LAYOUT, mode: 'wide' };

export const COMPACT_INPUT: SceneInput = {
  registry: NODE_REGISTRY,
  layout: EMPTY_LAYOUT,
  mode: 'compact',
  canvasWidth: 375,
};

export function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

export class Ids {
  private current: number;

  public constructor(start = 1) {
    this.current = start;
  }

  public next(): { id: string; key: string } {
    const index = this.current;
    this.current += 1;
    return { id: uuid(index), key: `n${String(index)}` };
  }
}

export function wireOf(reference: string): PortValue {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
}

export function setLight(ids: Ids, to: string | null, extra: Partial<FlowNode> = {}): FlowNode {
  return {
    ...ids.next(),
    kind: 'device.set',
    ports: {
      control: { lit: 'brightness' },
      to: to === null ? { lit: 75 } : wireOf(to),
    },
    ...extra,
  };
}

export function add(ids: Ids, from: string | null, extra: Partial<FlowNode> = {}): FlowNode {
  return {
    ...ids.next(),
    kind: 'math.add',
    ports: { a: from === null ? { lit: 1 } : wireOf(from), b: { lit: 2 } },
    ...extra,
  };
}

export function note(ids: Ids, message: string): FlowNode {
  return { ...ids.next(), kind: 'notify.feed', ports: { message: { lit: message } } };
}

export function timeTrigger(index: number): TriggerNode {
  return {
    id: uuid(900 + index),
    key: `t${String(index)}`,
    kind: 'trigger.time',
    ports: { at: { lit: '07:00' } },
  };
}

export function automation(
  nodes: readonly FlowNode[],
  extra: Partial<AutomationV3> = {},
): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [timeTrigger(0)],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...nodes] },
    policy: { mode: 'single' },
    ...extra,
  };
}

export function fn(nodes: readonly FlowNode[], extra: Partial<FunctionV3> = {}): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [{ name: 'level', type: { t: 'number' }, required: true }],
    outputs: [],
    exits: ['next', 'failed'],
    variables: [],
    body: { nodes: [...nodes] },
    ...extra,
  };
}

export function scope(nodes: readonly FlowNode[]): Scope {
  return { nodes: [...nodes] };
}

export function ifNode(
  ids: Ids,
  branches: readonly Scope[],
  other?: Scope,
  extra: Partial<FlowNode> = {},
): FlowNode {
  return {
    ...ids.next(),
    kind: 'flow.if',
    branches: branches.map((branch) => ({
      id: ids.next().id,
      when: { lit: true },
      scope: branch,
    })),
    ...(other === undefined ? {} : { scopes: { else: other } }),
    ...extra,
  };
}

type Spec =
  | { readonly t: 'set'; readonly ref: number | null }
  | { readonly t: 'add'; readonly ref: number | null }
  | { readonly t: 'note' }
  | {
      readonly t: 'if';
      readonly branches: readonly Spec[][];
      readonly other: readonly Spec[] | null;
    }
  | { readonly t: 'loop'; readonly body: readonly Spec[] }
  | { readonly t: 'try'; readonly body: readonly Spec[]; readonly caught: readonly Spec[] }
  | { readonly t: 'parallel'; readonly branches: readonly Spec[][] };

const ref = fc.option(fc.nat(7), { nil: null });

function specs(depth: number): fc.Arbitrary<readonly Spec[]> {
  return fc.array(spec(depth), { maxLength: 4 });
}

function spec(depth: number): fc.Arbitrary<Spec> {
  const leaf = fc.oneof(
    ref.map((r): Spec => ({ t: 'set', ref: r })),
    ref.map((r): Spec => ({ t: 'add', ref: r })),
    fc.constant<Spec>({ t: 'note' }),
  );
  if (depth <= 0) return leaf;
  const inner = specs(depth - 1);
  return fc.oneof(
    leaf,
    fc.record({
      t: fc.constant('if' as const),
      branches: fc.array(fc.array(spec(depth - 1), { maxLength: 3 }), {
        minLength: 1,
        maxLength: 2,
      }),
      other: fc.option(inner, { nil: null }),
    }),
    fc.record({ t: fc.constant('loop' as const), body: inner }),
    fc.record({ t: fc.constant('try' as const), body: inner, caught: inner }),
    fc.record({
      t: fc.constant('parallel' as const),
      branches: fc.array(fc.array(spec(depth - 1), { maxLength: 3 }), {
        minLength: 2,
        maxLength: 3,
      }),
    }),
  );
}

interface Builder {
  readonly ids: Ids;
  readonly pool: string[];
}

function pick(builder: Builder, index: number | null): string | null {
  const key = index === null ? undefined : builder.pool[index % Math.max(1, builder.pool.length)];
  return key === undefined ? null : `${key}.result`;
}

function build(builder: Builder, list: readonly Spec[]): Scope {
  return { nodes: list.map((entry) => node(builder, entry)) };
}

function row(builder: Builder, scopeValue: Scope): { id: string; when: PortValue; scope: Scope } {
  return { id: builder.ids.next().id, when: { lit: true }, scope: scopeValue };
}

function node(builder: Builder, entry: Spec): FlowNode {
  const { ids } = builder;
  switch (entry.t) {
    case 'set':
      return setLight(ids, pick(builder, entry.ref));
    case 'add': {
      const created = add(ids, pick(builder, entry.ref));
      builder.pool.push(created.key);
      return created;
    }
    case 'note':
      return note(ids, 'Hello');
    case 'if': {
      const base = ids.next();
      const rows = entry.branches.map((list) => row(builder, build(builder, list)));
      const other = entry.other === null ? {} : { scopes: { else: build(builder, entry.other) } };
      return { ...base, kind: 'flow.if', branches: rows, ...other };
    }
    case 'loop':
      return {
        ...ids.next(),
        kind: 'flow.repeat',
        ports: { times: { lit: 2 } },
        scopes: { body: build(builder, entry.body) },
      };
    case 'try': {
      const base = ids.next();
      return {
        ...base,
        kind: 'flow.try',
        scopes: { try: build(builder, entry.body) },
        catches: [{ id: ids.next().id, scope: build(builder, entry.caught) }],
      };
    }
    case 'parallel':
      return {
        ...ids.next(),
        kind: 'flow.parallel',
        scopes: Object.fromEntries(
          entry.branches.map((list, index) => [`b${String(index)}`, build(builder, list)]),
        ),
      };
  }
}

function programFrom(list: readonly Spec[], failure: readonly Spec[] | null): AutomationV3 {
  const builder = { ids: new Ids(), pool: [] };
  const body = build(builder, list);
  const onFailure = failure === null ? {} : { onFailure: build(builder, failure) };
  return automation(body.nodes, onFailure);
}

export const programs: fc.Arbitrary<AutomationV3> = fc
  .tuple(specs(2), fc.option(specs(1), { nil: null }))
  .map(([list, failure]) => programFrom(list, failure));

export const functionPrograms: fc.Arbitrary<FunctionV3> = specs(2).map((list) => {
  const builder = { ids: new Ids(), pool: [] };
  return fn(build(builder, list).nodes);
});

export function allNodeIds(program: AutomationV3 | FunctionV3): readonly string[] {
  const out: string[] = [];
  const walk = (list: readonly FlowNode[]): void => {
    for (const entry of list) {
      out.push(entry.id);
      for (const child of [
        ...(entry.branches ?? []).map((b) => b.scope),
        ...(entry.cases ?? []).map((c) => c.scope),
        ...(entry.catches ?? []).map((c) => c.scope),
        ...Object.values(entry.scopes ?? {}),
      ]) {
        walk(child.nodes);
      }
    }
  };
  walk(program.body.nodes);
  if ('onFailure' in program && program.onFailure !== undefined) walk(program.onFailure.nodes);
  if (program.kind === 'automation') out.push(...program.triggers.map((trigger) => trigger.id));
  return out;
}
