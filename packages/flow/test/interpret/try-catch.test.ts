import { JSON_VALUE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { InterpreterError, completeFrame, makeEnv } from '../../src/interpret/frames';
import { FLOW_ERRORS } from '../../src/state/errors';
import type { Env } from '../../src/interpret/frames';
import { restoreRunState, serialiseRunState } from '../../src/state/run-state';
import type { TryState } from '../../src/state/run-state';
import type { PlanOp } from '../../src/compile/plan';
import { context, failing, keys, row, tryOp } from './errors-support';
import {
  NOW,
  compute,
  effect,
  wired,
  fail,
  lit,
  output,
  planOf,
  readOp,
  ret,
  run,
  seq,
  stateOf,
  uuid,
} from './core-support';
import type { Trace } from './core-support';

function execute(body: PlanOp, resolve = failing('Refused')): Trace {
  const plan = planOf(body);
  return run(context(plan), stateOf(), { resolve });
}

describe('try catch rows', () => {
  it('runs the first row whose classes include the error and continues after the try', () => {
    const trace = execute(
      seq(
        tryOp('x', seq(effect('boom')), [
          row('c1', seq(effect('onUnreachable')), ['Unreachable']),
          row('c2', seq(effect('onRefused')), ['Refused', 'Invalid']),
          row('c3', seq(effect('onAny'))),
        ]),
        effect('after'),
      ),
    );
    expect(keys(trace)).toEqual(['boom', 'onRefused', 'after']);
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('treats a row without classes as every catchable class', () => {
    const trace = execute(
      seq(tryOp('x', seq(effect('boom')), [row('c', seq(effect('onAny')))])),
      failing('MathError'),
    );
    expect(keys(trace)).toEqual(['boom', 'onAny']);
  });

  it('shows the caught error as the try key error inside the catch scope', () => {
    const trace = execute(
      seq(
        tryOp('x', seq(effect('boom')), [row('c', seq(effect('read', { e: wired('x.error') })))]),
      ),
    );
    expect(trace.requests[1]?.params['e']).toMatchObject({
      class: 'Refused',
      message: 'boom failed',
      attempt: 1,
    });
  });

  it('fails the run when no row matches and the error is not caught', () => {
    const trace = execute(
      seq(
        tryOp('x', seq(effect('boom')), [row('c', seq(effect('onOther')), ['Invalid'])]),
        effect('after'),
      ),
    );
    expect(keys(trace)).toEqual(['boom']);
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'Refused' } });
  });

  it('lets an inner uncaught error reach the outer catch after the inner finally', () => {
    const inner = tryOp('x', seq(effect('boom')), [], { finally: seq(effect('innerFinally')) });
    const outer = tryOp('v', seq(inner), [row('c', seq(effect('outerCatch')))], {
      finally: seq(effect('outerFinally')),
    });
    const trace = execute(seq(outer, effect('after')));
    expect(keys(trace)).toEqual(['boom', 'innerFinally', 'outerCatch', 'outerFinally', 'after']);
  });

  it('does not catch what a catch-all row cannot: budget errors and cancellation bypass rows', () => {
    const trace = execute(
      seq(
        tryOp('x', seq(effect('boom')), [row('c', seq(effect('onAny')))], {
          finally: seq(effect('cleanup')),
        }),
      ),
      failing('BudgetExceeded'),
    );
    expect(keys(trace)).toEqual(['boom', 'cleanup']);
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'BudgetExceeded' } });
  });

  it('catches an error raised by a fail node and a failure of a calculation', () => {
    const failNode = execute(
      seq(tryOp('x', seq(fail(lit('no'))), [row('c', seq(effect('onFailed')), ['Failed'])])),
    );
    expect(keys(failNode)).toEqual(['onFailed']);
    const math = execute(
      seq(
        tryOp('x', seq(effect('p', { v: wired('bad.value') })), [
          row('c', seq(effect('onMath')), ['MathError']),
        ]),
        compute('bad', 'test.fail', {}),
      ),
    );
    expect(keys(math)).toEqual(['onMath']);
  });

  it('turns a failing structured output into an error that skips the catch rows', () => {
    const bad = output('result', { try: wired('bad.value') });
    const trace = execute(
      seq(
        tryOp('x', seq(), [row('c', seq(effect('onAny')))], { outputs: [bad] }),
        compute('bad', 'test.fail', {}),
      ),
    );
    expect(keys(trace)).toEqual([]);
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'MathError' } });
  });
});

describe('try structured outputs', () => {
  const outputs = [output('result', { try: lit('from body'), c: lit('from catch') })];

  it('publishes the body scope values when nothing failed', () => {
    const trace = execute(
      seq(
        tryOp('x', seq(effect('fine')), [row('c', seq())], { outputs }),
        effect('after', { r: wired('x.result') }),
      ),
    );
    expect(trace.requests[1]?.params).toEqual({ r: 'from body' });
  });

  it('publishes the catch scope values when a row handled the error', () => {
    const trace = execute(
      seq(
        tryOp('x', seq(effect('boom')), [row('c', seq())], { outputs }),
        effect('after', { r: wired('x.result') }),
      ),
    );
    expect(trace.requests[1]?.params).toEqual({ r: 'from catch' });
  });
});

describe('try outputs that evaluate to nothing', () => {
  it('leaves an absent value out of the published outputs', () => {
    const outputs = [output('result', { try: wired('inputs.missing') })];
    const trace = execute(
      seq(
        tryOp('x', seq(effect('fine')), [], { outputs }),
        effect('after', { r: wired('x.result') }),
      ),
    );
    expect(trace.requests[1]?.params).toEqual({});
  });
});

describe('try with captured reads', () => {
  it('starts the catch scope fresh while a read of the failed body is still captured', () => {
    const body = seq(readOp('r'), effect('boom', { p: wired('r.value') }));
    const trace = execute(seq(tryOp('x', body, [row('c', seq(effect('caught')))])));
    expect(keys(trace)).toEqual(['boom', 'caught']);
    expect(trace.state.captures).toEqual({});
  });
});

describe('try outputs without a value for the scope', () => {
  it('leaves out outputs that name no value for the scope that ran', () => {
    const outputs = [output('result', { c: lit('only catch') })];
    const trace = execute(
      seq(
        tryOp('x', seq(effect('fine')), [row('c', seq())], { outputs }),
        effect('after', { r: wired('x.result') }),
      ),
    );
    expect(trace.requests[1]?.params).toEqual({});
  });
});

describe('try finally', () => {
  const cleanup = { finally: seq(effect('cleanup')) };

  it('runs once after a normal end', () => {
    const trace = execute(seq(tryOp('x', seq(effect('fine')), [], cleanup), effect('after')));
    expect(keys(trace)).toEqual(['fine', 'cleanup', 'after']);
  });

  it('runs once after a handled error, after the catch scope', () => {
    const trace = execute(
      seq(tryOp('x', seq(effect('boom')), [row('c', seq(effect('caught')))], cleanup)),
    );
    expect(keys(trace)).toEqual(['boom', 'caught', 'cleanup']);
  });

  it('runs once before an unhandled error leaves and keeps that error', () => {
    const trace = execute(seq(tryOp('x', seq(effect('boom')), [], cleanup), effect('after')));
    expect(keys(trace)).toEqual(['boom', 'cleanup']);
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Refused', message: 'boom failed' },
    });
  });

  it('runs once before a return leaves and keeps the returned values', () => {
    const trace = execute(
      seq(tryOp('x', seq(ret({ v: lit(3) }, 'quit')), [], cleanup), effect('after')),
    );
    expect(keys(trace)).toEqual(['cleanup']);
    expect(trace.outcome).toMatchObject({ kind: 'done', exit: 'quit', outputs: { v: 3 } });
  });

  it('runs once when an error is raised inside a catch scope', () => {
    const trace = execute(
      seq(tryOp('x', seq(effect('boom')), [row('c', seq(effect('boomAgain')))], cleanup)),
      failing('Refused', 'Invalid'),
    );
    expect(keys(trace)).toEqual(['boom', 'boomAgain', 'cleanup']);
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'Invalid' } });
  });

  it('replaces the original error with the error of the finally and keeps it as the cause', () => {
    const body = tryOp('x', seq(effect('boom')), [], { finally: seq(effect('boomCleanup')) });
    const trace = execute(seq(body), failing('Refused', 'Unreachable'));
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Unreachable', cause: { class: 'Refused' } },
    });
  });

  it('keeps the original error at the end of the chain when the finally error has its own cause', () => {
    const cause = FLOW_ERRORS.Timeout('slow', { node: uuid(), path: 'body/ops/1', at: NOW });
    const finalizer = fail(lit('wrapped'), { cause: lit(JSON_VALUE.parse(cause)) });
    const body = tryOp('x', seq(effect('boom')), [], { finally: seq(finalizer) });
    const plan = planOf(seq(body));
    const trace = run(context(plan), stateOf(), {
      resolve: failing('Refused'),
    });
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'wrapped', cause: { class: 'Timeout', cause: { class: 'Refused' } } },
    });
  });

  it('does not repeat the original error when the finally error already carries it as its cause', () => {
    const boom = effect('boom');
    const first = execute(seq(tryOp('x', seq(boom), [], {})));
    const original = first.outcome.kind === 'failed' ? first.outcome.error : undefined;
    const finalizer = fail(lit('wrapped'), { cause: lit(JSON_VALUE.parse(original)) });
    const body = tryOp('x', seq(boom), [], { finally: seq(finalizer) });
    const trace = execute(seq(body));
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'wrapped', cause: { class: 'Refused' } },
    });
    expect(trace.outcome.kind === 'failed' && trace.outcome.error.cause).toEqual(original);
  });

  it('fails with the finally error alone when the body had succeeded', () => {
    const body = tryOp('x', seq(effect('fine')), [], { finally: seq(effect('boomCleanup')) });
    const trace = execute(seq(body), failing('Invalid'));
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'Invalid' } });
    expect(trace.outcome.kind === 'failed' && trace.outcome.error.cause).toBeFalsy();
  });

  it('lets a return inside the finally override the pending completion', () => {
    const body = tryOp('x', seq(effect('boom')), [], { finally: seq(ret({ v: lit(1) })) });
    const trace = execute(seq(body));
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded', outputs: { v: 1 } });
  });

  it('survives a serialisation round trip while parked in the finally', () => {
    const plan = planOf(seq(tryOp('x', seq(effect('boom')), [], cleanup), effect('after')));
    const first = run(context(plan), stateOf());
    expect(first.outcome.kind).toBe('effect');
    const restored = restoreRunState(serialiseRunState(first.state));
    const second = run(context(plan), restored, { start: false, resolve: failing('Refused') });
    expect(keys(second)).toEqual(['boom', 'cleanup']);
  });
});

describe('try frame invariants', () => {
  function withTryFrame(body: PlanOp, path: string, tryState?: TryState): Env {
    const ctx = context(planOf(body));
    const base = stateOf();
    const frame = {
      id: 'f9',
      kind: 'try' as const,
      path,
      pc: 0,
      locals: {},
      outputs: {},
      ...(tryState === undefined ? {} : { tryState }),
    };
    return makeEnv(ctx, { ...base, frames: [...base.frames, frame] }, NOW);
  }

  it('refuses a try frame that has lost its try state', () => {
    const env = withTryFrame(seq(tryOp('x', seq(), [])), 'body/ops/0/body');
    expect(() => completeFrame(env, { kind: 'normal' })).toThrow(InterpreterError);
  });

  it('refuses a try frame whose parent is not a try operation', () => {
    const env = withTryFrame(seq(effect('fx')), 'body', {
      phase: 'body',
      completion: { kind: 'normal' },
    });
    expect(() => completeFrame(env, { kind: 'normal' })).toThrow(InterpreterError);
  });

  it('refuses a try frame whose parent has nothing left to run', () => {
    const env = withTryFrame(seq(), 'body', { phase: 'body', completion: { kind: 'normal' } });
    expect(() => completeFrame(env, { kind: 'normal' })).toThrow(InterpreterError);
  });

  it('refuses a catch phase that names no row', () => {
    const env = withTryFrame(seq(tryOp('x', seq(), [])), 'body/ops/0/body', {
      phase: 'catch',
      completion: { kind: 'normal' },
    });
    expect(() => completeFrame(env, { kind: 'normal' })).toThrow(InterpreterError);
  });
});
