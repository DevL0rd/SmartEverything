import { JSON_VALUE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { completeFrame, makeEnv } from '../../src/interpret/frames';
import { FLOW_ERRORS } from '../../src/state/errors';
import {
  NOW,
  BROKEN,
  broken,
  at,
  branch,
  contextOf,
  effect,
  wired,
  fail,
  lit,
  planOf,
  ret,
  run,
  seq,
  stateOf,
  stop,
  uuid,
} from './core-support';

const ok = (): { ok: true; value: Record<string, never> } => ({ ok: true, value: {} });

describe('return', () => {
  it('ends the run at once with the given values and exit', () => {
    const plan = planOf(seq(ret({ a: lit(1), b: wired('inputs.n') }, 'quit'), effect('never')));
    const trace = run(contextOf(plan), stateOf({ inputs: { n: 2 } }), { resolve: ok });
    expect(trace.requests).toEqual([]);
    expect(trace.outcome).toEqual({
      kind: 'done',
      status: 'succeeded',
      exit: 'quit',
      outputs: { a: 1, b: 2 },
    });
  });

  it('uses the default exit when none is named and leaves out absent values', () => {
    const plan = planOf(seq(ret({ a: wired('inputs.missing'), b: lit(true) })));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.outcome).toEqual({
      kind: 'done',
      status: 'succeeded',
      exit: 'done',
      outputs: { b: true },
    });
  });

  it('ends the whole run when it sits inside a nested scope', () => {
    const plan = planOf(
      seq(branch('br', [['a', lit(true), seq(ret({ v: lit(9) }))]]), effect('never')),
    );
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests).toEqual([]);
    expect(trace.outcome).toMatchObject({ kind: 'done', outputs: { v: 9 } });
  });

  it('fails with the class of the failing value expression', () => {
    const plan = planOf(seq(ret({ v: BROKEN }), broken()));
    const trace = run(contextOf(plan), stateOf({ inputs: { n: 1 } }));
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'MathError' } });
  });
});

describe('stop', () => {
  it('ends the run as succeeded without a note when it has no message', () => {
    const plan = planOf(seq(stop(), effect('never')));
    const trace = run(contextOf(plan), stateOf(), { resolve: ok });
    expect(trace.requests).toEqual([]);
    expect(trace.outcome).toEqual({ kind: 'done', status: 'succeeded', exit: 'done', outputs: {} });
    expect(trace.records).toEqual([]);
  });

  it('notes its message when it ends the run as succeeded', () => {
    const plan = planOf(seq(stop({ message: lit('enough') })));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.records).toEqual([{ kind: 'note', node: 'stop', message: 'enough' }]);
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('ends the run as failed with the message as the error', () => {
    const op = stop({ failed: true, message: lit('too hot') });
    const trace = run(contextOf(planOf(seq(op))), stateOf());
    expect(trace.records).toEqual([]);
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: {
        class: 'Failed',
        message: 'too hot',
        node: op.op === 'stop' ? op.at.id : '',
        path: 'body/ops/0',
      },
    });
  });

  it('names the stopping step in the error when it has no message', () => {
    const trace = run(contextOf(planOf(seq(stop({ failed: true })))), stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'the automation was stopped by stop' },
    });
  });

  it('cannot be caught by the scopes it leaves', () => {
    const plan = planOf(
      seq(branch('br', [['a', lit(true), seq(stop({ failed: true, message: lit('x') }))]])),
    );
    expect(run(contextOf(plan), stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Failed' },
    });
  });

  it('ends the run as cancelled when it cancels itself', () => {
    const plan = planOf(seq(stop({ cancelSelf: true, failed: true, message: lit('bye') })));
    const trace = run(contextOf(plan), stateOf());
    expect(trace.outcome).toEqual({
      kind: 'done',
      status: 'cancelled',
      exit: 'done',
      outputs: {},
      reason: 'user_stop',
    });
    expect(trace.records).toEqual([]);
  });

  it('fails with TypeError when its message is not text', () => {
    const trace = run(contextOf(planOf(seq(stop({ message: lit(3) })))), stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'TypeError', message: 'the message of stop must be text, received 3' },
    });
  });
});

describe('fail', () => {
  it('raises an error of the named class with the message', () => {
    const op = fail(lit('no good'), { class: 'Refused' });
    const trace = run(contextOf(planOf(seq(op))), stateOf());
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Refused', message: 'no good', attempt: 1, path: 'body/ops/0' },
    });
  });

  it('keeps the error it was given as the cause', () => {
    const cause = FLOW_ERRORS.Timeout('slow', { node: uuid(), path: 'body/ops/1', at: NOW });
    const plan = planOf(seq(fail(lit('wrapped'), { cause: wired('inputs.cause') })));
    const trace = run(contextOf(plan), stateOf({ inputs: { cause: JSON_VALUE.parse(cause) } }));
    expect(trace.outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'wrapped', cause: { class: 'Timeout', message: 'slow' } },
    });
  });

  it('fails with TypeError when the cause is not an error value', () => {
    const plan = planOf(seq(fail(lit('x'), { cause: lit('oops') })));
    expect(run(contextOf(plan), stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'TypeError', message: 'the cause must be an error value, received "oops"' },
    });
  });

  it('fails when the cause gives no value', () => {
    const plan = planOf(seq(fail(lit('x'), { cause: wired('inputs.missing') })));
    expect(run(contextOf(plan), stateOf()).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'TypeError', message: 'the cause must be a value, received nothing' },
    });
  });

  it('fails with TypeError when the message is not text', () => {
    const trace = run(contextOf(planOf(seq(fail(lit(5))))), stateOf());
    expect(trace.outcome).toMatchObject({ kind: 'failed', error: { class: 'TypeError' } });
  });
});

describe('the end of the run', () => {
  const plan = planOf(seq());
  const ctx = contextOf(plan);

  function ended(
    completion: Parameters<typeof completeFrame>[1],
  ): ReturnType<typeof completeFrame> {
    return completeFrame(makeEnv(ctx, stateOf(), NOW), completion);
  }

  it('fails when a break or continue reaches it', () => {
    expect(ended({ kind: 'break', target: 'loop' }).outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Failed', message: 'break reached the end of the run outside a loop' },
    });
    expect(ended({ kind: 'continue', target: 'loop' }).outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'continue reached the end of the run outside a loop' },
    });
  });

  it('fails with the error it is given', () => {
    const error = FLOW_ERRORS.Unreachable('gone', { node: at('x').id, path: 'p', at: NOW });
    expect(ended({ kind: 'error', error }).outcome).toEqual({ kind: 'failed', error });
  });

  it('ends as cancelled with the reason it is given', () => {
    expect(ended({ kind: 'cancelled', reason: 'shutdown' }).outcome).toMatchObject({
      status: 'cancelled',
      reason: 'shutdown',
    });
  });

  it('ends an ordinary return without values as succeeded through the default exit', () => {
    expect(ended({ kind: 'return' }).outcome).toEqual({
      kind: 'done',
      status: 'succeeded',
      exit: 'done',
      outputs: {},
    });
  });
});
