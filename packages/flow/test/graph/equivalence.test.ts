import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY, PROGRAM_V3, PROGRAM_V4 } from '@smarteverything/domain';
import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { lower } from '../../src/compile/lower';
import type { Plan, PlanOp } from '../../src/compile/plan';
import { interfaceOf } from '../../src/functions/interface-hash';
import { canonicalise } from '../../src/graph/place-values';
import { comparePlans, normalisePlan } from '../../src/graph/plan-normalise';
import { structuredOf } from '../../src/graph/structured-of';
import { unstructure } from '../../src/graph/unstructure';
import { indexProgram } from '../../src/program/lookup';
import type { Program } from '../../src/program/walk';
import { compareTraces, runScenario, scenariosFor, stepDelta } from './equivalence-harness';
import type { Trace, TraceDifference, World } from './equivalence-harness';

const FIXTURES = [
  'var-chains',
  'if-empty-row',
  'if-empty-else',
  'switch',
  'for-each-collect',
  'repeat',
  'try-catch-finally',
  'parallel-outputs',
  'parallel-if-path',
  'fn-call',
  'snapshot-restore',
  'wait',
  'return-in-if-row',
  'return-in-if-row-rest-in-else',
  'decisions-meet-at-return',
  'guard-quietly',
  'guard-in-row',
  'values',
] as const;

const HOISTED: readonly string[] = ['return-in-if-row-rest-in-else'];

const CALLEE_ID = '11111111-1111-4111-8111-111111111111';

function loadFixture(name: string): Program {
  const text = readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
  return PROGRAM_V3.parse(JSON.parse(text));
}

function planOf(tree: Program): Plan {
  const lowered = lower(tree, { kinds: (id) => NODE_REGISTRY.get(id) });
  if (!lowered.ok) throw new Error(JSON.stringify(lowered.problems));
  return lowered.plan;
}

function graphPlan(graph: ProgramV4): Plan {
  const structured = structuredOf(graph, STATIC_KIND_LOOKUP);
  if (structured.kind !== 'structured') {
    throw new Error(structured.problems.map((problem) => problem.message).join(' | '));
  }
  return planOf(structured.tree);
}

function sameNodes(before: Trace, after: Trace): boolean {
  const sorted = (trace: Trace): string =>
    JSON.stringify(trace.nodes.map((node) => JSON.stringify(node)).sort());
  return sorted(before) === sorted(after);
}

function differences(name: string, before: Trace, after: Trace): readonly TraceDifference[] {
  const reordered = HOISTED.includes(name) && sameNodes(before, after);
  return compareTraces(before, after).filter((found) => !(reordered && found.field === 'nodes'));
}

function worldFor(name: string): World {
  const devices = {
    hall: { power: 'off', level: 0, color: 'white' },
    kitchen: { power: 'off', level: 0 },
    tv: { power: 'on' },
  };
  if (name !== 'fn-call') return { devices, variables: { streak: 0 } };
  const callee = loadFixture('fn-callee');
  if (callee.kind !== 'function') throw new Error('the callee fixture is not a function');
  const plan = planOf(callee);
  return { devices, callee: { id: CALLEE_ID, plan, shape: interfaceOf(callee) } };
}

function tracesOf(name: string, plan: Plan): readonly Trace[] {
  const tree = loadFixture(name);
  const triggers = tree.kind === 'automation' ? tree.triggers : [];
  return triggers.flatMap((trigger) =>
    scenariosFor(trigger.key).map((scenario) => runScenario(plan, scenario, worldFor(name))),
  );
}

describe.each(FIXTURES)('the fixture %s', (name) => {
  const tree = loadFixture(name);
  const graph = unstructure(tree, STATIC_KIND_LOOKUP);

  it('converts into a valid graph that structures back to the canonical tree', () => {
    expect(PROGRAM_V4.safeParse(graph).success).toBe(true);
    const structured = structuredOf(graph, STATIC_KIND_LOOKUP);
    if (structured.kind !== 'structured') throw new Error('the graph did not structure');
    expect(structured.tree).toEqual(canonicalise(tree, STATIC_KIND_LOOKUP));
  });

  it('lowers to the same plan on the three routes', () => {
    const before = planOf(tree);
    const canonical = planOf(canonicalise(tree, STATIC_KIND_LOOKUP));
    expect(comparePlans(before, canonical).equal).toBe(!HOISTED.includes(name));
    expect(comparePlans(canonical, graphPlan(graph))).toMatchObject({ equal: true });
  });

  it('does what the stored program did in every scenario', () => {
    const before = tracesOf(name, planOf(tree));
    const after = tracesOf(name, graphPlan(graph));
    expect(before.length).toBeGreaterThan(0);
    before.forEach((trace, index) => {
      const other = after[index];
      if (other === undefined) throw new Error('a scenario is missing after the conversion');
      expect(differences(name, trace, other)).toEqual([]);
      expect(trace.outcome.kind).toBe('done');
    });
  });
});

describe('the equivalence report', () => {
  it('lists hash equality and the step-count delta for every program', () => {
    const rows = FIXTURES.map((name) => {
      const tree = loadFixture(name);
      const before = planOf(tree);
      const after = graphPlan(unstructure(tree, STATIC_KIND_LOOKUP));
      const deltas = tracesOf(name, before).map((trace, index) => {
        const other = tracesOf(name, after)[index];
        return other === undefined ? NaN : stepDelta(trace, other);
      });
      return {
        name,
        ...comparePlans(planOf(canonicalise(tree, STATIC_KIND_LOOKUP)), after),
        deltas,
      };
    });
    expect(rows.filter((row) => !row.equal).map((row) => row.name)).toEqual([]);
    expect(rows.every((row) => row.deltas.every(Number.isInteger))).toBe(true);
  });
});

describe('the scenarios', () => {
  it('reach every construct of the inventory', () => {
    const kinds = new Set(
      FIXTURES.flatMap((name) => indexProgram(loadFixture(name)).nodes.map((e) => e.node.kind)),
    );
    for (const kind of [
      'var.set',
      'var.change',
      'flow.if',
      'flow.switch',
      'flow.for_each',
      'flow.repeat',
      'flow.try',
      'flow.parallel',
      'fn.call',
      'device.snapshot',
      'device.restore',
      'flow.wait',
      'flow.return',
      'flow.guard',
      'debug.log',
      'device.set',
      'logic.compare',
      'logic.in',
      'weather.read',
    ]) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it('drive the branches, waits, loops and variable writes of the fixtures', () => {
    const traces = (name: string): readonly Trace[] => tracesOf(name, planOf(loadFixture(name)));
    expect(traces('switch').map((trace) => trace.effects.map((e) => e.kind))).toEqual([
      ['device.set', 'notify.feed'],
      ['debug.log', 'device.set', 'notify.feed'],
      ['debug.log', 'device.set', 'notify.feed'],
    ]);
    expect(traces('wait')[0]?.waits.map((wait) => wait.kind)).toEqual(['duration']);
    expect(traces('var-chains')[2]?.writes.map((write) => write.name)).toEqual([
      'streak',
      'streak',
    ]);
    const loops = traces('for-each-collect')[0]?.nodes.map((node) => node.iteration.length);
    expect(loops).toContain(1);
    expect(traces('guard-quietly').map((trace) => trace.effects.length)).toEqual([1, 3, 3]);
    expect(
      traces('return-in-if-row').map((trace) => trace.effects.map((effect) => effect.kind)),
    ).toEqual([
      ['debug.log', 'notify.feed'],
      ['debug.log', 'device.set'],
      ['debug.log', 'device.set'],
    ]);
    expect(traces('fn-call')[0]?.effects.map((effect) => effect.kind)).toEqual([
      'debug.log',
      'device.set',
      'notify.feed',
    ]);
  });
});

describe('a conversion that sends the run the wrong way', () => {
  it('is caught by the trace comparison', () => {
    const tree = loadFixture('snapshot-restore');
    const graph = unstructure(tree, STATIC_KIND_LOOKUP);
    const rewire = (node: GraphNode): GraphNode => {
      if (node.key === 'saved') return { ...node, to: { next: 'dim' } };
      if (node.key === 'dim') return { ...node, to: { next: 'red' } };
      if (node.key === 'red') return { ...node, to: { next: 'back' } };
      return node;
    };
    const broken: ProgramV4 = { ...graph, nodes: graph.nodes.map(rewire) };
    const good = tracesOf('snapshot-restore', graphPlan(graph));
    const bad = tracesOf('snapshot-restore', graphPlan(broken));
    const before = tracesOf('snapshot-restore', planOf(tree));
    const [first] = before;
    const [second] = bad;
    if (first === undefined || second === undefined) throw new Error('no scenario ran');
    expect(compareTraces(first, second).map((difference) => difference.field)).toContain('effects');
    expect(good.map((trace, index) => compareTraces(trace, before[index] ?? trace))).toEqual([
      [],
      [],
      [],
    ]);
  });
});

function ops(...list: PlanOp[]): PlanOp {
  return { op: 'seq', ops: list };
}

function planWith(body: PlanOp): Plan {
  return { version: 1, subject: 'automation', exits: [], variables: [], body };
}

describe('normalisePlan', () => {
  const at = (key: string): { id: string; key: string } => ({ id: `id-${key}`, key });
  const compute = (key: string): PlanOp => ({
    op: 'compute',
    at: at(key),
    kind: 'math.add',
    ports: {},
  });
  const lazy = (key: string): PlanOp => ({
    op: 'read',
    at: at(key),
    kind: 'device.get',
    ports: {},
    reads: [],
  });
  const stop: PlanOp = { op: 'stop', at: at('stop'), failed: false, cancelSelf: false };

  it('lifts compute ops and lazy reads out of their sequences into a key-sorted map', () => {
    const done = normalisePlan(planWith(ops(compute('zed'), stop, ops(lazy('abc')))));
    expect(Object.keys(done.values)).toEqual(['abc', 'zed']);
    expect(done.plan.body).toEqual(ops(stop, ops()));
  });

  it('keeps a read that captures at its step where it is', () => {
    const snapshot: PlanOp = {
      op: 'read',
      at: at('saved'),
      kind: 'device.snapshot',
      ports: {},
      reads: [],
      capture: 'at-step',
    };
    expect(normalisePlan(planWith(ops(snapshot))).plan.body).toEqual(ops(snapshot));
  });

  const branch = (extra: Partial<Extract<PlanOp, { op: 'branch' }>>): PlanOp => ({
    op: 'branch',
    at: at('b'),
    rows: [{ id: 'r', when: { lit: true }, then: ops(stop) }],
    ...extra,
  });

  it('treats an empty else as absent when there are no structured outputs', () => {
    const emptied = normalisePlan(planWith(ops(branch({ else: ops(compute('v')) }))));
    const absent = normalisePlan(planWith(ops(branch({}))));
    expect(emptied.plan).toEqual(absent.plan);
  });

  it('keeps an empty else that a structured output gives a value for', () => {
    const outputs = [{ name: 'o', values: { else: { lit: 1 } } }];
    const kept = normalisePlan(planWith(ops(branch({ else: ops(), outputs }))));
    expect(JSON.stringify(kept.plan)).toContain('"else"');
  });

  it('does not inline nested sequences', () => {
    const nested = comparePlans(planWith(ops(ops(stop))), planWith(ops(stop)));
    expect(nested.equal).toBe(false);
  });
});
