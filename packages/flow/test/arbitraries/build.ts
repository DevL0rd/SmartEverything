import type { FlowNode, JsonValue, PortValue, Scope } from '@smarteverything/domain';
import { uuid } from '../check/c23-support';
import { CALLEE_ID } from './rig';
import type {
  Branching,
  Compound,
  Forking,
  Guarding,
  Leaf,
  Looping,
  LoopKind,
  Shape,
} from './shapes';

const lit = (value: JsonValue): PortValue => ({ lit: value });

const wired = (reference: string): PortValue => {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
};

export interface Site {
  readonly loops: readonly string[];
  readonly calls: boolean;
  readonly writes: boolean;
}

const LOOP_KINDS: Readonly<Record<LoopKind, string>> = {
  repeat: 'flow.repeat',
  while: 'flow.while',
  until: 'flow.do_until',
  each: 'flow.for_each',
  range: 'flow.for_range',
};

function isCompound(shape: Shape): shape is Compound {
  return shape.t === 'if' || shape.t === 'loop' || shape.t === 'parallel' || shape.t === 'try';
}

const inLoop = (site: Site): boolean => site.loops.length > 0;

const GATES: Partial<Record<Shape['t'], (site: Site) => boolean>> = {
  bump: (site) => site.writes,
  call: (site) => site.calls,
  break: inLoop,
  continue: inLoop,
};

function allowed(shape: Shape, site: Site): boolean {
  return GATES[shape.t]?.(site) ?? true;
}

type Test = (goal: number, below: boolean) => PortValue;

function loopSource(shape: Looping, test: Test): Record<string, PortValue> {
  switch (shape.kind) {
    case 'repeat':
      return { times: lit(shape.count) };
    case 'while':
      return { condition: test(shape.count, true) };
    case 'until':
      return { condition: test(shape.count, false) };
    case 'each':
      return {
        items: lit(Array.from({ length: shape.count }, (_, index) => index)),
        concurrency: lit(shape.concurrency),
      };
    case 'range':
      return { from: lit(0), to: lit(shape.count), step: lit(1) };
  }
}

function loopLimit(shape: Looping): JsonValue | undefined {
  if (shape.limit === 'none') return undefined;
  return shape.limit === 'iterations'
    ? { iterations: Math.max(1, shape.count), onLimit: shape.onLimit }
    : { time: 400, onLimit: shape.onLimit };
}

export class Builder {
  private counter = 0;

  private readonly pending: FlowNode[] = [];

  scope(shapes: readonly Shape[], site: Site): Scope {
    return { nodes: shapes.flatMap((shape) => this.node(shape, site)) };
  }

  private node(shape: Shape, site: Site): FlowNode[] {
    if (!allowed(shape, site)) return [];
    const mark = this.pending.length;
    const made = isCompound(shape) ? [this.compound(shape, site)] : this.leaf(shape);
    return [...this.pending.splice(mark), ...made];
  }

  private readonly test: Test = (goal, below) => {
    const compare = this.plain('logic.compare', {
      a: wired('vars.i'),
      op: lit(below ? 'lt' : 'gte'),
      b: lit(goal),
    });
    this.pending.push(compare);
    return wired(`${compare.key}.result`);
  };

  private plain(
    kind: string,
    ports: Record<string, PortValue>,
    extra: Partial<FlowNode> = {},
  ): FlowNode {
    this.counter += 1;
    return { id: uuid(), key: `n${String(this.counter)}`, kind, ports, ...extra };
  }

  private leaf(shape: Leaf): FlowNode[] {
    switch (shape.t) {
      case 'effect':
        return [this.plain('probe.take', { need: lit('x') })];
      case 'bump':
        return [this.plain('var.change', { name: lit('i'), op: lit('add'), amount: lit(1) })];
      case 'call':
        return [this.plain('fn.call', { fn: lit(CALLEE_ID) })];
      case 'break':
      case 'continue':
        return [this.plain(`flow.${shape.t}`, {})];
      case 'fail':
        return [
          this.plain('flow.fail', { class: lit(shape.errorClass), message: lit(shape.errorClass) }),
        ];
      case 'wait':
        return [this.wait(shape)];
    }
  }

  private wait(shape: Extract<Leaf, { t: 'wait' }>): FlowNode {
    switch (shape.kind) {
      case 'duration':
        return this.plain('flow.wait', { duration: lit(shape.ms) });
      case 'until':
        return this.plain('flow.wait_until_time', {
          at: lit(1_800_000_000_000 + shape.ms * 1000),
          ifLate: lit('run'),
        });
      case 'event':
        return this.plain('flow.wait_event', {
          source: lit('device'),
          kind: lit('changed'),
          timeout: lit(shape.ms),
        });
      case 'condition':
        return this.plain('flow.wait_condition', {
          condition: this.test(shape.goal, false),
          timeout: lit(shape.ms),
        });
    }
  }

  private compound(shape: Compound, site: Site): FlowNode {
    switch (shape.t) {
      case 'if':
        return this.branch(shape, site);
      case 'loop':
        return this.loop(shape, site);
      case 'parallel':
        return this.fork(shape);
      case 'try':
        return this.guard(shape, site);
    }
  }

  private branch(shape: Branching, site: Site): FlowNode {
    const when = this.test(shape.goal, false);
    return this.plain(
      'flow.if',
      {},
      {
        branches: [{ id: uuid(), when, scope: this.scope(shape.then, site) }],
        scopes: { else: this.scope(shape.otherwise, site) },
      },
    );
  }

  private loop(shape: Looping, site: Site): FlowNode {
    const made = this.plain(LOOP_KINDS[shape.kind], {});
    const inside: Site = { ...site, loops: [...site.loops, made.key] };
    const body: readonly Shape[] = shape.bump ? [{ t: 'bump' }, ...shape.body] : shape.body;
    const limit = loopLimit(shape);
    return {
      ...made,
      ports: {
        ...loopSource(shape, this.test),
        ...(shape.gap > 0 ? { gap: lit(shape.gap) } : {}),
        ...(limit === undefined ? {} : { limit: lit(limit) }),
      },
      scopes: { body: this.scope(body, inside) },
    };
  }

  private fork(shape: Forking): FlowNode {
    const inside: Site = { loops: [], calls: false, writes: false };
    const lanes = shape.branches.map((lane, index): [string, Scope] => [
      `lane${String(index)}`,
      this.scope(lane, inside),
    ]);
    return this.plain(
      'flow.parallel',
      { join: lit(shape.join), errors: lit(shape.errors) },
      { scopes: Object.fromEntries(lanes) },
    );
  }

  private guard(shape: Guarding, site: Site): FlowNode {
    return this.plain(
      'flow.try',
      {},
      {
        scopes: { try: this.scope(shape.body, site), finally: this.scope(shape.cleanup, site) },
        catches: shape.catches ? [{ id: uuid(), scope: this.scope([], site) }] : [],
      },
    );
  }
}
