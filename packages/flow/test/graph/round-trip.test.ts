import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { env } from 'node:process';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PROGRAM_V3, PROGRAM_V4 } from '@smarteverything/domain';
import type { AutomationV3, FlowNode, JsonValue, PortValue, Scope } from '@smarteverything/domain';
import { canonicalise } from '../../src/graph/place-values';
import { structuredOf } from '../../src/graph/structured-of';
import { unstructure } from '../../src/graph/unstructure';

const CASES = z.coerce.number().int().min(1).default(20).parse(env['GRAPH_ROUND_TRIP_CASES']);

type Body = readonly Shape[];

type Shape =
  | { readonly t: 'step' | 'log' | 'guard' }
  | { readonly t: 'repeat'; readonly body: Body }
  | { readonly t: 'cooldown'; readonly lane: Body | undefined }
  | { readonly t: 'parallel'; readonly paths: readonly Body[] }
  | {
      readonly t: 'try';
      readonly body: Body;
      readonly catches: readonly Body[] | undefined;
      readonly cleanup: Body;
    }
  | {
      readonly t: 'if';
      readonly rows: readonly Body[];
      readonly other: Body | undefined;
      readonly early: boolean;
      readonly stops: boolean;
    }
  | {
      readonly t: 'switch';
      readonly cases: readonly Body[];
      readonly other: Body | undefined;
      readonly early: boolean;
    };

const shapes: fc.Arbitrary<Body> = fc.letrec<{ body: Body; shape: Shape }>((tie) => {
  const body = tie('body');
  const optional = fc.option(body, { nil: undefined });
  return {
    body: fc.array(tie('shape'), { maxLength: 3 }),
    shape: fc.oneof(
      { arbitrary: fc.constantFrom<Shape>({ t: 'step' }, { t: 'log' }, { t: 'guard' }), weight: 6 },
      {
        arbitrary: fc.record({
          t: fc.constant('if' as const),
          rows: fc.array(body, { minLength: 1, maxLength: 2 }),
          other: optional,
          early: fc.boolean(),
          stops: fc.boolean(),
        }),
        weight: 2,
      },
      {
        arbitrary: fc.record({
          t: fc.constant('switch' as const),
          cases: fc.array(body, { minLength: 1, maxLength: 2 }),
          other: optional,
          early: fc.boolean(),
        }),
        weight: 1,
      },
      { arbitrary: fc.record({ t: fc.constant('repeat' as const), body }), weight: 1 },
      { arbitrary: fc.record({ t: fc.constant('cooldown' as const), lane: optional }), weight: 1 },
      {
        arbitrary: fc.record({
          t: fc.constant('parallel' as const),
          paths: fc.array(body, { minLength: 2, maxLength: 3 }),
        }),
        weight: 1,
      },
      {
        arbitrary: fc.record({
          t: fc.constant('try' as const),
          body,
          catches: fc.option(fc.array(body, { maxLength: 2 }), { nil: undefined }),
          cleanup: body,
        }),
        weight: 1,
      },
    ),
  };
}).body;

const lit = (value: JsonValue): PortValue => ({ lit: value });

function endsPlainly(row: Body): boolean {
  return row.every((shape) => shape.t === 'step' || shape.t === 'log');
}

class TreeBuilder {
  private count = 0;

  private plain(
    kind: string,
    ports: Record<string, PortValue>,
    extra: Partial<FlowNode> = {},
  ): FlowNode {
    this.count += 1;
    const id = `00000000-0000-4000-8000-${String(this.count).padStart(12, '0')}`;
    return { id, key: `n${String(this.count)}`, kind, ports, ...extra };
  }

  scope(body: Body, inPath: boolean): Scope {
    const early: FlowNode[] = [];
    const nodes = body.flatMap((shape) => this.node(shape, inPath, early));
    return { nodes: [...early, ...nodes] };
  }

  private test(early: FlowNode[], hoist: boolean): { before: FlowNode[]; when: PortValue } {
    const compare = this.plain('logic.compare', {
      a: { wire: { from: 'trigger', port: 'tick' } },
      op: lit('gt'),
      b: lit(1),
    });
    if (hoist) early.push(compare);
    return {
      before: hoist ? [] : [compare],
      when: { wire: { from: compare.key, port: 'result' } },
    };
  }

  private node(shape: Shape, inPath: boolean, early: FlowNode[]): FlowNode[] {
    switch (shape.t) {
      case 'step':
        return [this.plain('device.set', { target: lit({ target: 'hall' }), to: lit(1) })];
      case 'log':
        return [this.plain('debug.log', { message: lit('hi') })];
      case 'guard':
        return [this.plain('flow.guard', { condition: lit(true), quietly: lit(true) })];
      case 'repeat':
        return [
          this.plain(
            'flow.repeat',
            { times: lit(2) },
            { scopes: { body: this.scope(shape.body, inPath) } },
          ),
        ];
      case 'cooldown':
        return [this.cooldown(shape.lane, inPath)];
      case 'parallel':
        return [this.fork(shape.paths)];
      case 'try':
        return [this.attempt(shape, inPath)];
      case 'if':
        return this.branch(shape, inPath, early);
      case 'switch':
        return this.choose(shape, inPath, early);
    }
  }

  private cooldown(lane: Body | undefined, inPath: boolean): FlowNode {
    const plainLane =
      lane === undefined
        ? undefined
        : [{ t: 'step' as const }, ...lane.map((): Shape => ({ t: 'step' }))];
    const scopes =
      plainLane === undefined ? {} : { scopes: { blocked: this.scope(plainLane, inPath) } };
    return this.plain('timing.cooldown', { duration: lit(1000) }, scopes);
  }

  private fork(paths: readonly Body[]): FlowNode {
    const named = paths.map((path, index): [string, Scope] => [
      `p${String(index)}`,
      this.scope(path, true),
    ]);
    return this.plain('flow.parallel', {}, { scopes: Object.fromEntries(named) });
  }

  private attempt(shape: Extract<Shape, { t: 'try' }>, inPath: boolean): FlowNode {
    const cleanup = this.scope(shape.cleanup, inPath);
    const scopes = {
      try: this.scope(shape.body, inPath),
      ...(cleanup.nodes.length === 0 ? {} : { finally: cleanup }),
    };
    const catches = shape.catches?.map((row) => ({
      id: this.plain('x', {}).id,
      scope: this.scope(row, inPath),
    }));
    return this.plain('flow.try', {}, { scopes, ...(catches === undefined ? {} : { catches }) });
  }

  private branch(
    shape: Extract<Shape, { t: 'if' }>,
    inPath: boolean,
    early: FlowNode[],
  ): FlowNode[] {
    const { before, when } = this.test(early, shape.early);
    const open = shape.other === undefined || shape.other.length === 0;
    const rows = shape.rows.map((row, index) => {
      const made = this.scope(row, inPath);
      const stop = shape.stops && index === 0 && open && !inPath && endsPlainly(row);
      const nodes = stop ? [...made.nodes, this.plain('flow.stop', {})] : made.nodes;
      return { id: this.plain('x', {}).id, when, scope: { nodes } };
    });
    const scopes =
      shape.other === undefined ? {} : { scopes: { else: this.scope(shape.other, inPath) } };
    return [...before, this.plain('flow.if', {}, { branches: rows, ...scopes })];
  }

  private choose(
    shape: Extract<Shape, { t: 'switch' }>,
    inPath: boolean,
    early: FlowNode[],
  ): FlowNode[] {
    const { before, when } = this.test(early, shape.early);
    const cases = shape.cases.map((row, index) => ({
      id: this.plain('x', {}).id,
      match: { eq: index },
      scope: this.scope(row, inPath),
    }));
    const scopes =
      shape.other === undefined ? {} : { scopes: { default: this.scope(shape.other, inPath) } };
    return [...before, this.plain('flow.switch', { subject: when }, { cases, ...scopes })];
  }
}

function treeOf(body: Body): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [
      {
        id: '00000000-0000-4000-8000-ffffffffffff',
        key: 'tick',
        kind: 'trigger.interval',
        ports: { every: lit(60000) },
      },
    ],
    inputs: [],
    outputs: [],
    variables: [],
    body: new TreeBuilder().scope(body, false),
    policy: { mode: 'single' },
  };
}

describe('the round trip', () => {
  it('builds valid trees to start from', () => {
    fc.assert(
      fc.property(shapes, (body) => {
        expect(PROGRAM_V3.safeParse(treeOf(body)).success).toBe(true);
      }),
      { numRuns: CASES },
    );
  });

  it('structures a converted tree back to its canonical form', () => {
    fc.assert(
      fc.property(shapes, (body) => {
        const tree = treeOf(body);
        const graph = unstructure(tree, STATIC_KIND_LOOKUP);
        expect(PROGRAM_V4.safeParse(graph).success).toBe(true);
        const structured = structuredOf(graph, STATIC_KIND_LOOKUP);
        if (structured.kind !== 'structured') {
          throw new Error(structured.problems.map((problem) => problem.message).join(' | '));
        }
        expect(structured.tree).toEqual(canonicalise(tree, STATIC_KIND_LOOKUP));
      }),
      { numRuns: CASES },
    );
  });

  it('converts a structured graph back to the graph it came from', () => {
    fc.assert(
      fc.property(shapes, (body) => {
        const graph = unstructure(
          canonicalise(treeOf(body), STATIC_KIND_LOOKUP),
          STATIC_KIND_LOOKUP,
        );
        const structured = structuredOf(graph, STATIC_KIND_LOOKUP);
        if (structured.kind !== 'structured') throw new Error('the graph did not structure');
        expect(unstructure(structured.tree, STATIC_KIND_LOOKUP)).toEqual(graph);
      }),
      { numRuns: CASES },
    );
  });
});
