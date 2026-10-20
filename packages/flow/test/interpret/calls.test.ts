import type { InputPort } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CALL_EXIT_KEY,
  CALL_INPUTS_KEY,
  CALL_KEY,
  callInputs,
  calleeOf,
} from '../../src/interpret/calls';
import { completeFrame, makeEnv } from '../../src/interpret/frames';
import type { PlanRef } from '../../src/state/run-state';
import {
  BROKEN,
  branch,
  broken,
  plus,
  wired,
  fail,
  failedClass,
  guard,
  lit,
  planOf,
  ret,
  seq,
  setVar,
  NOW,
  stop,
} from './core-support';
import {
  HASH,
  NUMBER,
  callOp,
  contextFor,
  drive,
  functionPlan,
  iface,
  input,
  messageOf,
  output,
  probe,
  start,
} from './calls-support';
import type { Driven, Rig } from './calls-support';

describe('call frames', () => {
  it('runs the body in a new call frame holding the inputs by value', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1', { x: lit(4) }), probe())),
      callees: { fn1: functionPlan(seq(probe())) },
      interfaces: { fn1: iface({ inputs: [input('x')] }) },
    };
    const trace = start(rig);
    expect(trace.requests).toHaveLength(1);
    const top = trace.state.frames.at(-1);
    expect(top?.kind).toBe('call');
    expect(top === undefined ? null : calleeOf(top)).toEqual({ id: 'fn1', revision: 1 });
    expect(callInputs(trace.state)).toEqual({ x: 4 });
    expect(top?.outputs[CALL_KEY]).toMatchObject({ key: 'c', function: 'fn1', exits: [] });
    expect(trace.state.frames[0]?.outputs[CALL_INPUTS_KEY]).toBeUndefined();
  });

  it('has no call inputs and no callee outside a call', () => {
    const trace = start({ caller: planOf(seq(probe())), callees: {} });
    expect(callInputs(trace.state)).toBeUndefined();
    const [root] = trace.state.frames;
    expect(root === undefined ? undefined : calleeOf(root)).toBeNull();
  });

  it('hands the returned outputs and the default exit to the caller and continues', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(ret({ result: lit(5) }))) },
      interfaces: { fn1: iface({ outputs: [output('result')] }) },
    };
    const trace = start(rig);
    expect(trace.state.frames).toHaveLength(1);
    expect(trace.state.frames[0]?.outputs['c']).toEqual({ result: 5, [CALL_EXIT_KEY]: 'done' });
    expect(trace.state.frames[0]?.pc).toBe(1);
  });

  it('lets the caller read the outputs of the call', () => {
    const rig: Rig = {
      caller: planOf(
        seq(callOp('c', 'fn1'), ret({ x: wired('more.value') }), plus('more', 'c.value', 1)),
      ),
      callees: { fn1: functionPlan(seq(ret({ value: lit(5) }))) },
      interfaces: { fn1: iface({ outputs: [output('value')] }) },
    };
    const trace = start(rig);
    expect(trace.outcome).toMatchObject({ kind: 'done', outputs: { x: 6 } });
  });

  it('ends the body without a return as an implicit return with the default exit', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(guard('g', lit(true)))) },
    };
    const trace = start(rig);
    expect(trace.state.frames[0]?.outputs['c']).toEqual({ [CALL_EXIT_KEY]: 'done' });
  });

  it('returns from inside nested scopes and records the chosen exit', () => {
    const inner = branch('b', [['yes', lit(true), seq(ret({ result: lit(1) }, 'alt'))]]);
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(inner, ret({ result: lit(2) }))) },
      interfaces: { fn1: iface({ outputs: [output('result')], exits: ['alt'] }) },
    };
    const trace = start(rig);
    expect(trace.state.frames[0]?.outputs['c']).toEqual({ result: 1, [CALL_EXIT_KEY]: 'alt' });
  });

  it('leaves an optional output absent when the body does not return it', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(ret({}))) },
      interfaces: { fn1: iface({ outputs: [output('result', true)] }) },
    };
    const trace = start(rig);
    expect(trace.state.frames[0]?.outputs['c']).toEqual({ [CALL_EXIT_KEY]: 'done' });
  });

  it('keeps only the declared outputs', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(ret({ result: lit(1), extra: lit(2) }))) },
      interfaces: { fn1: iface({ outputs: [output('result')] }) },
    };
    const trace = start(rig);
    expect(trace.state.frames[0]?.outputs['c']).toEqual({ result: 1, [CALL_EXIT_KEY]: 'done' });
  });

  it('fails with Invalid when a required output is not returned', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees: { fn1: functionPlan(seq(ret({}))) },
      interfaces: { fn1: iface({ outputs: [output('result')] }) },
    };
    const trace = start(rig);
    expect(failedClass(trace)).toBe('Invalid');
    expect(messageOf(trace)).toContain('"result"');
  });

  it('fails with Invalid when the body returns an exit the interface does not declare', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees: { fn1: functionPlan(seq(ret({}, 'nowhere'))) },
      interfaces: { fn1: iface({ exits: ['alt'] }) },
    };
    const trace = start(rig);
    expect(failedClass(trace)).toBe('Invalid');
    expect(messageOf(trace)).toContain('nowhere');
  });

  it('starts the variables of the body from their initial values', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: {
        fn1: functionPlan(
          seq(
            setVar('s', { name: 'v', to: wired('next.value') }),
            ret({ value: wired('vars.v') }),
            plus('next', 'vars.v', 1),
          ),
          { variables: [{ name: 'v', type: NUMBER, initial: lit(10) }] },
        ),
      },
      interfaces: { fn1: iface({ outputs: [output('value')] }) },
    };
    const trace = start(rig);
    expect(trace.state.frames[0]?.outputs['c']).toMatchObject({ value: 11 });
    expect(trace.state.frames[0]?.locals).toEqual({});
  });

  it('fails the call when a variable initial value is absent', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1', { n: lit(0) }))),
      callees: {
        fn1: functionPlan(seq(ret({})), {
          variables: [{ name: 'v', type: NUMBER, initial: wired('inputs.missing') }],
        }),
      },
      interfaces: { fn1: iface({ inputs: [input('n')] }) },
    };
    const trace = start(rig);
    expect(failedClass(trace)).toBe('Invalid');
    expect(trace.state.frames).toHaveLength(1);
  });

  it('fails the call when a variable initial value cannot be evaluated', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees: {
        fn1: functionPlan(seq(ret({}), broken()), {
          variables: [{ name: 'v', type: NUMBER, initial: BROKEN }],
        }),
      },
    };
    const trace = start(rig);
    expect(failedClass(trace)).toBe('MathError');
  });
});

describe('call inputs', () => {
  const callee = functionPlan(seq(probe()));

  function failure(ports: Record<string, ReturnType<typeof lit>>, inputs: InputPort[]): Driven {
    return start({
      caller: planOf(seq(callOp('c', 'fn1', ports), broken())),
      callees: { fn1: callee },
      interfaces: { fn1: iface({ inputs }) },
    });
  }

  it('names a required input that was not given', () => {
    const trace = failure({}, [input('x')]);
    expect(failedClass(trace)).toBe('Invalid');
    expect(messageOf(trace)).toContain('"x"');
    expect(trace.outcome).toMatchObject({ error: { path: 'body/ops/0' } });
  });

  it('refuses a given value that does not fit the declared type, naming the port', () => {
    const trace = failure({ x: lit('5') }, [input('x')]);
    expect(failedClass(trace)).toBe('Invalid');
    expect(messageOf(trace)).toContain('"x"');
  });

  it('treats an absent value as not given', () => {
    const trace = failure({ x: wired('inputs.missing') }, [input('x')]);
    expect(failedClass(trace)).toBe('Invalid');
  });

  it('names an input the interface does not declare', () => {
    const trace = failure({ y: lit(1) }, [input('x', { required: false })]);
    expect(failedClass(trace)).toBe('Invalid');
    expect(messageOf(trace)).toContain('"y"');
  });

  it('fills the default of an input that was not given', () => {
    const trace = failure({}, [input('x', { required: false, default: 7 })]);
    expect(callInputs(trace.state)).toEqual({ x: 7 });
  });

  it('keeps a given null instead of the default', () => {
    const trace = failure({ x: lit(null) }, [
      input('x', { required: false, default: 7, type: { t: 'optional', of: NUMBER } }),
    ]);
    expect(callInputs(trace.state)).toEqual({ x: null });
  });

  it('leaves an optional input without a default out of the frame', () => {
    const trace = failure({}, [input('x', { required: false })]);
    expect(callInputs(trace.state)).toEqual({});
  });

  it('raises the error of an input that cannot be evaluated in the caller', () => {
    const trace = failure({ x: BROKEN }, [input('x')]);
    expect(failedClass(trace)).toBe('MathError');
  });
});

describe('call resolution', () => {
  const callees = { fn1: functionPlan(seq(ret({}))) };

  it('fails with NotFound when the run did not pin the node', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees,
      refs: [],
    });
    expect(failedClass(trace)).toBe('NotFound');
  });

  it('fails with NotFound when the pinned revision is not in the run', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1', {}, 3))),
      callees,
    });
    expect(failedClass(trace)).toBe('NotFound');
  });

  it('uses the revision the node pins', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1', {}, 2), probe())),
      callees: { fn1: functionPlan(seq(probe())) },
      refs: [
        { id: 'fn1', revision: 1, hash: HASH },
        { id: 'fn1', revision: 2, hash: HASH },
      ],
    });
    const top = trace.state.frames.at(-1);
    expect(top === undefined ? null : calleeOf(top)).toEqual({ id: 'fn1', revision: 2 });
  });

  it('runs the latest pinned revision when the call follows latest, whatever the order', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(probe())) },
      refs: [
        { id: 'fn1', revision: 1, hash: HASH },
        { id: 'fn1', revision: 3, hash: HASH },
        { id: 'fn1', revision: 2, hash: HASH },
      ],
    });
    const top = trace.state.frames.at(-1);
    expect(top === undefined ? null : calleeOf(top)).toEqual({ id: 'fn1', revision: 3 });
  });

  it('passes the failure of the resolver to the caller', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees,
      resolver: () => ({ ok: false, class: 'NotFound', message: 'the revision is gone' }),
    });
    expect(failedClass(trace)).toBe('NotFound');
  });

  it('asks the resolver for the pinned reference', () => {
    const asked: PlanRef[] = [];
    start({
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees,
      resolver: (ref) => {
        asked.push(ref);
        return { ok: true, value: iface() };
      },
    });
    expect(asked).toEqual([{ id: 'fn1', revision: 1, hash: HASH }]);
  });
});

describe('call completions', () => {
  it('propagates an error of the body to the caller and drops the frame', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(fail(lit('boom')))) },
    });
    expect(failedClass(trace)).toBe('Failed');
    expect(trace.outcome).toMatchObject({ error: { message: 'boom' } });
    expect(trace.requests).toEqual([]);
  });

  it('ends the whole run when the body stops', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1'), probe())),
      callees: { fn1: functionPlan(seq(stop())) },
    });
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
    expect(trace.requests).toEqual([]);
  });

  it('fails the whole run when the body stops as failed', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees: { fn1: functionPlan(seq(stop({ failed: true, message: lit('no') }))) },
    });
    expect(failedClass(trace)).toBe('Failed');
  });

  it('cancels the whole run when the body cancels itself', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees: { fn1: functionPlan(seq(stop({ cancelSelf: true }))) },
    });
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'cancelled' });
  });

  it.each(['break', 'continue'] as const)(
    'fails the call when a %s reaches the end of the body',
    (kind) => {
      const rig: Rig = {
        caller: planOf(seq(callOp('c', 'fn1'))),
        callees: { fn1: functionPlan(seq(probe())) },
      };
      const inside = start(rig).state;
      const env = makeEnv(contextFor(rig, inside), inside, NOW);
      const ended = completeFrame(env, { kind, target: 'loop' });
      expect(ended.outcome).toMatchObject({ kind: 'failed', error: { class: 'Failed' } });
      expect(ended.outcome.kind === 'failed' ? ended.outcome.error.message : '').toContain(kind);
    },
  );

  it('cancels through the call frame', () => {
    const rig: Rig = {
      caller: planOf(seq(callOp('c', 'fn1'))),
      callees: { fn1: functionPlan(seq(probe())) },
    };
    const started = start(rig);
    const cancelled = {
      ...started.state,
      cancel: { reason: 'user_stop' as const, requestedAt: 1 },
    };
    const trace = drive(rig, cancelled);
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'cancelled', reason: 'user_stop' });
  });
});

describe('nested calls', () => {
  it('nests calls and unwinds the outputs level by level', () => {
    const trace = start({
      caller: planOf(seq(callOp('c', 'outer'), probe())),
      callees: {
        outer: functionPlan(seq(callOp('c', 'inner'), ret({ value: wired('c.value') }))),
        inner: functionPlan(seq(ret({ value: lit(9) }))),
      },
      interfaces: {
        outer: iface({ outputs: [output('value')] }),
        inner: iface({ outputs: [output('value')] }),
      },
    });
    expect(trace.state.frames).toHaveLength(1);
    expect(trace.state.frames[0]?.outputs['c']).toMatchObject({ value: 9 });
  });
});
