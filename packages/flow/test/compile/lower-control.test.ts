import type { FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import { codesOf, wired, lit, make, opOf, opsOf, problemsOf, run, scope } from './support';

const INNER = '00000000-0000-4000-9000-000000000001';
const OTHER = '00000000-0000-4000-9000-000000000002';

function loop(
  kind: string,
  ports: Record<string, ReturnType<typeof lit>>,
  ...body: FlowNode[]
): FlowNode {
  return make('lp', kind, ports, { scopes: { body: scope(...body) } });
}

function asLoop(op: PlanOp): Extract<PlanOp, { op: 'loop' }> {
  if (op.op !== 'loop') throw new Error('not a loop');
  return op;
}

function inner(op: PlanOp, depth = 0): PlanOp[] {
  const found = asLoop(op).body;
  if (found.op !== 'seq') throw new Error('not a seq');
  const [first] = found.ops;
  if (depth === 0 || first === undefined) return found.ops;
  return inner(first, depth - 1);
}

describe('branching', () => {
  it('lowers if rows, else and structured outputs', () => {
    const node = make(
      'i',
      'flow.if',
      {},
      {
        branches: [
          { id: INNER, when: wired('a.value'), scope: scope(make('one', 'flow.stop')) },
          { id: OTHER, when: lit(true), scope: scope() },
        ],
        scopes: { else: scope(make('two', 'flow.stop')) },
        outputs: [{ name: 'out', values: { else: lit(1) } }],
      },
    );
    expect(opOf(node)).toMatchObject({
      op: 'branch',
      rows: [
        {
          id: INNER,
          when: { wire: { from: 'a', port: 'value' } },
          then: { ops: [{ op: 'stop' }] },
        },
        { id: OTHER, when: { lit: true }, then: { ops: [] } },
      ],
      else: { ops: [{ op: 'stop' }] },
      outputs: [{ name: 'out' }],
    });
  });

  it('lowers if without else', () => {
    const node = make(
      'i',
      'flow.if',
      {},
      { branches: [{ id: INNER, when: lit(true), scope: scope() }] },
    );
    expect(opOf(node)).toMatchObject({ op: 'branch', else: undefined });
  });

  it('lowers an if without branches to no rows', () => {
    const result = run([make('i', 'flow.if')]);
    expect(result.ok && result.plan.body).toMatchObject({
      ops: [{ op: 'branch', rows: [] }],
    });
  });

  it('lowers switch with default and mode', () => {
    const node = make(
      's',
      'flow.switch',
      { subject: wired('x.value'), mode: lit('all') },
      {
        cases: [{ id: INNER, match: { eq: 1 }, scope: scope(make('a', 'flow.stop')) }],
        scopes: { default: scope() },
      },
    );
    expect(opOf(node)).toMatchObject({
      op: 'switch',
      mode: 'all',
      subject: { wire: { from: 'x', port: 'value' } },
      cases: [{ id: INNER, match: { eq: 1 }, then: { ops: [{ op: 'stop' }] } }],
      default: { op: 'seq' },
    });
  });

  it('defaults switch to first match and no cases', () => {
    expect(opOf(make('s', 'flow.switch', { subject: lit(1) }))).toMatchObject({
      mode: 'first',
      cases: [],
      default: undefined,
    });
  });

  it('lowers a guard and defaults it to quiet', () => {
    expect(opOf(make('g', 'flow.guard', { condition: wired('ok.value') }))).toMatchObject({
      op: 'guard',
      condition: { wire: { from: 'ok', port: 'value' } },
      quietly: true,
    });
    expect(
      opOf(make('g', 'flow.guard', { condition: lit(true), quietly: lit(false) })),
    ).toMatchObject({ quietly: false });
  });
});

describe('loops and the gap rules', () => {
  const limit = lit({ time: 5000, onLimit: 'end', note: 'stopped' });

  it('repeat skips the gap after the last count and clips it to the deadline', () => {
    const op = asLoop(opOf(loop('flow.repeat', { times: lit(3), gap: lit(500), limit })));
    expect(op).toMatchObject({
      source: { kind: 'count', times: { lit: 3 } },
      test: undefined,
      entryTest: false,
      order: 'gap_then_test',
      gap: { ms: 500, skipAfterLast: true, clipToDeadline: true },
      limit: { time: 5000, onLimit: 'end', note: 'stopped' },
    });
  });

  it('while checks before the first pass and gaps then checks', () => {
    const op = asLoop(opOf(loop('flow.while', { condition: wired('busy.value'), gap: lit(1000) })));
    expect(op).toMatchObject({
      source: { kind: 'open' },
      test: { when: { wire: { from: 'busy', port: 'value' } }, stopWhen: false },
      entryTest: true,
      order: 'gap_then_test',
      gap: { ms: 1000, skipAfterLast: false, clipToDeadline: false },
      limit: undefined,
    });
  });

  it('do until checks right after the body and before the gap', () => {
    const op = asLoop(
      opOf(
        loop('flow.do_until', {
          condition: wired('done.value'),
          gap: lit(250),
          limit: lit({ iterations: 5, onLimit: 'fail' }),
        }),
      ),
    );
    expect(op).toMatchObject({
      test: { when: { wire: { from: 'done', port: 'value' } }, stopWhen: true },
      entryTest: false,
      order: 'test_then_gap',
      gap: { ms: 250, skipAfterLast: false, clipToDeadline: false },
      limit: { iterations: 5, onLimit: 'fail' },
    });
  });

  it('drops a zero gap', () => {
    expect(asLoop(opOf(loop('flow.repeat', { times: lit(2), gap: lit(0) }))).gap).toBeUndefined();
  });

  it('lowers for each with its snapshot options and collect', () => {
    const op = asLoop(
      opOf(
        loop('flow.for_each', {
          items: wired('list.value'),
          concurrency: lit(4),
          reverse: lit(true),
          collect: wired('item.value'),
        }),
      ),
    );
    expect(op.source).toEqual({
      kind: 'items',
      items: { wire: { from: 'list', port: 'value' } },
      concurrency: 4,
      reverse: true,
      collect: { wire: { from: 'item', port: 'value' } },
    });
    expect(op.gap).toBeUndefined();
  });

  it('defaults for each to one at a time, forward, without collect', () => {
    expect(asLoop(opOf(loop('flow.for_each', { items: lit([1]) }))).source).toMatchObject({
      concurrency: 1,
      reverse: false,
      collect: undefined,
    });
  });

  it('lowers a counting range with the default step', () => {
    expect(
      asLoop(opOf(loop('flow.for_range', { from: lit(1), to: wired('n.value') }))).source,
    ).toEqual({
      kind: 'range',
      from: { lit: 1 },
      to: { wire: { from: 'n', port: 'value' } },
      step: { lit: 1 },
    });
  });

  it('refuses a loop with a formula in a fixed setting or a bad limit', () => {
    expect(codesOf([loop('flow.repeat', { times: lit(1), gap: wired('x.value') })])).toEqual([
      'static_not_literal',
    ]);
    expect(codesOf([loop('flow.repeat', { times: lit(1), limit: lit({ time: 5 }) })])).toEqual([
      'invalid_literal',
    ]);
    expect(codesOf([loop('flow.repeat', {})])).toEqual(['missing_port']);
  });

  it('lowers a loop without a body scope to an empty body', () => {
    expect(asLoop(opOf(make('lp', 'flow.repeat', { times: lit(1) }))).body).toEqual({
      op: 'seq',
      ops: [],
    });
  });
});

describe('break and continue', () => {
  it('targets the innermost loop by default', () => {
    const op = opOf(loop('flow.repeat', { times: lit(1) }, make('out', 'flow.break')));
    expect(inner(op)).toMatchObject([{ op: 'break', target: 'lp' }]);
  });

  it('targets a named enclosing loop', () => {
    const innerLoop = make(
      'in',
      'flow.repeat',
      { times: lit(1) },
      { scopes: { body: scope(make('c', 'flow.continue', { target: lit('lp') })) } },
    );
    const op = opOf(loop('flow.repeat', { times: lit(1) }, innerLoop));
    expect(inner(op, 1)).toMatchObject([{ op: 'continue', target: 'lp' }]);
  });

  it('refuses an unknown target and a step outside any loop', () => {
    const found = problemsOf([
      loop('flow.repeat', { times: lit(1) }, make('a', 'flow.break', { target: lit('nope') })),
      make('b', 'flow.continue'),
    ]);
    expect(found).toMatchObject([
      { code: 'unknown_loop', port: 'target', received: 'nope', expected: 'lp' },
      { code: 'break_outside_loop', key: 'b' },
    ]);
  });

  it('does not let a break leave a parallel branch', () => {
    const branch = scope(make('x', 'flow.break'));
    const parallel = make('p', 'flow.parallel', {}, { scopes: { a: branch, b: scope() } });
    expect(codesOf([loop('flow.repeat', { times: lit(1) }, parallel)])).toEqual([
      'break_outside_loop',
    ]);
  });

  it('lets a break leave a try', () => {
    const tried = make('t', 'flow.try', {}, { scopes: { try: scope(make('x', 'flow.break')) } });
    expect(codesOf([loop('flow.repeat', { times: lit(1) }, tried)])).toEqual([]);
  });
});

describe('parallel and try', () => {
  it('lowers parallel branches in scope order', () => {
    const node = make(
      'p',
      'flow.parallel',
      { join: lit('settled'), errors: lit('settle') },
      { scopes: { left: scope(make('a', 'flow.stop')), right: scope() } },
    );
    expect(opOf(node)).toMatchObject({
      op: 'parallel',
      join: 'settled',
      errors: 'settle',
      branches: [{ name: 'left', body: { ops: [{ op: 'stop' }] } }, { name: 'right' }],
    });
  });

  it('defaults parallel to wait for all and cancel on the first error', () => {
    expect(
      opOf(make('p', 'flow.parallel', {}, { scopes: { a: scope(), b: scope() } })),
    ).toMatchObject({
      join: 'all',
      errors: 'failFast',
      branches: [{ name: 'a' }, { name: 'b' }],
    });
  });

  it('lowers parallel without any scope to no branches', () => {
    const result = run([make('p', 'flow.parallel')]);
    expect(result.ok && result.plan.body).toMatchObject({
      ops: [{ op: 'parallel', branches: [] }],
    });
  });

  it('lowers try with catch rows and finally', () => {
    const node = make(
      't',
      'flow.try',
      {},
      {
        scopes: { try: scope(make('a', 'flow.stop')), finally: scope(make('z', 'flow.stop')) },
        catches: [
          { id: INNER, classes: ['Timeout'], scope: scope(make('h', 'flow.stop')) },
          { id: OTHER, scope: scope() },
        ],
      },
    );
    expect(opOf(node)).toMatchObject({
      op: 'try',
      body: { ops: [{ op: 'stop' }] },
      catches: [
        { id: INNER, classes: ['Timeout'], then: { ops: [{ op: 'stop' }] } },
        { id: OTHER, classes: undefined },
      ],
      finally: { ops: [{ op: 'stop' }] },
    });
  });

  it('lowers try without catch rows or finally', () => {
    expect(opOf(make('t', 'flow.try'))).toMatchObject({
      body: { ops: [] },
      catches: [],
      finally: undefined,
    });
  });
});

describe('temporary changes', () => {
  const wait = (key: string): FlowNode => make(key, 'flow.wait', { duration: lit(1000) });

  function waitsOf(ops: PlanOp[]): Record<string, boolean> {
    const found: Record<string, boolean> = {};
    const visit = (op: PlanOp): void => {
      if (op.op === 'wait') found[op.at.key] = op.durable;
      if (op.op === 'seq') {
        op.ops.forEach(visit);
      }
      if (op.op === 'with_effect') visit(op.body);
      if (op.op === 'loop') visit(op.body);
      if (op.op === 'branch') {
        op.rows.forEach((row) => {
          visit(row.then);
        });
      }
    };
    ops.forEach(visit);
    return found;
  }

  it('lowers a region and marks every wait inside it as not durable', () => {
    const tail = make('after', 'flow.wait', { duration: lit(5) });
    const nested = make(
      'lp',
      'flow.repeat',
      { times: lit(2) },
      { scopes: { body: scope(wait('deep')) } },
    );
    const choice = make(
      'ch',
      'flow.if',
      {},
      { branches: [{ id: INNER, when: lit(true), scope: scope(wait('viaIf')) }] },
    );
    const region = make(
      'region',
      'device.set_temporarily',
      { target: lit('lamp'), to: lit(true), duration: lit(1000) },
      { scopes: { body: scope(wait('inside'), nested, choice) } },
    );
    const ops = opsOf([wait('before'), region, tail]);
    expect(ops[1]).toMatchObject({
      op: 'with_effect',
      kind: 'device.set_temporarily',
      retry: 'idempotent',
      budget: 'command',
      params: { duration: { lit: 1000 } },
    });
    expect(waitsOf(ops)).toEqual({
      before: true,
      inside: false,
      deep: false,
      viaIf: false,
      after: true,
    });
  });

  it('lets a break leave the region for an outer loop', () => {
    const region = make(
      'region',
      'device.set_temporarily',
      { target: lit('lamp'), to: lit(true) },
      { scopes: { body: scope(make('out', 'flow.break')) } },
    );
    expect(codesOf([loop('flow.repeat', { times: lit(1) }, region)])).toEqual([]);
  });

  it('lowers a region without a body to an empty body', () => {
    expect(
      opOf(make('region', 'device.set_temporarily', { target: lit('lamp'), to: lit(true) })),
    ).toMatchObject({ body: { ops: [] } });
  });
});
