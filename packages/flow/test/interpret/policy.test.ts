import type { ErrorClass, NodePolicy } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import { CORE_OPS } from '../../src/interpret/core-ops';
import type {
  EffectRequest,
  Env,
  NodeResult,
  Outcome,
  StepEvent,
  StepResult,
} from '../../src/interpret/frames';
import { completeFrame, makeEnv, next, stay } from '../../src/interpret/frames';
import { step } from '../../src/interpret/step';
import { backoffMs, policyDeadline, repeatAllowed, withPolicy } from '../../src/interpret/policy';
import type { RunState, Wait } from '../../src/state/run-state';
import {
  NOW,
  at,
  compute,
  effect,
  wired,
  lit,
  planOf,
  run,
  seq,
  setVar,
  stateOf,
} from './core-support';
import { context, row, tryOp } from './errors-support';

type Step = ErrorClass | 'ok';

interface Drive {
  readonly outcome: Outcome;
  readonly state: RunState;
  readonly requests: EffectRequest[];
  readonly waits: Wait[];
  readonly nows: number[];
}

function down(errorClass: ErrorClass): NodeResult {
  return { ok: false, class: errorClass, message: 'it failed' };
}

function drive(body: PlanOp, script: readonly Step[], clockStep = 1000): Drive {
  const ctx = context(planOf(body));
  const queue = [...script];
  const requests: EffectRequest[] = [];
  const waits: Wait[] = [];
  const nows: number[] = [];
  let state = stateOf();
  let now = NOW;
  let event: StepEvent = { kind: 'start', now };
  for (let count = 0; count < 500; count += 1) {
    const stepped = step(ctx, state, event);
    state = stepped.state;
    const { outcome } = stepped;
    if (outcome.kind === 'continue') {
      event = { kind: 'run', now };
    } else if (outcome.kind === 'effect') {
      requests.push(outcome.request);
      nows.push(now);
      const next = queue.shift() ?? 'ok';
      event = {
        kind: 'resolved',
        now,
        result: next === 'ok' ? { ok: true, value: {} } : down(next),
      };
    } else if (outcome.kind === 'park') {
      waits.push(outcome.wait);
      now = 'dueAt' in outcome.wait ? outcome.wait.dueAt : now + clockStep;
      event = { kind: 'resolved', now, result: { ok: true, value: {} } };
    } else {
      return { outcome, state, requests, waits, nows };
    }
  }
  throw new Error('the run did not stop');
}

const retry = (extra: Partial<NonNullable<NodePolicy['retry']>> = {}): NodePolicy => ({
  retry: { attempts: 3, backoff: 'fixed', initial: 1000, ...extra },
});

const keysOf = (result: Drive): string[] => result.requests.map((request) => request.node.key);

describe('onError', () => {
  it('fails the run by default and when set to fail', () => {
    for (const policy of [undefined, { onError: 'fail' } as const]) {
      const result = drive(seq(effect('fx', {}, { policy }), effect('after')), ['Refused']);
      expect(keysOf(result)).toEqual(['fx']);
      expect(result.outcome).toMatchObject({ kind: 'failed', error: { class: 'Refused' } });
    }
  });

  it('continues after the node and exposes the error as its error output', () => {
    const body = seq(
      effect('fx', {}, { policy: { onError: 'continue' } }),
      effect('after', { e: wired('fx.error'), v: wired('fx.value') }),
    );
    const result = drive(body, ['Unreachable']);
    expect(keysOf(result)).toEqual(['fx', 'after']);
    expect(result.requests[1]?.params['e']).toMatchObject({
      class: 'Unreachable',
      message: 'it failed',
    });
    expect(result.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('does not continue past a class that cannot be caught', () => {
    const body = seq(effect('fx', {}, { policy: { onError: 'continue' } }), effect('after'));
    const result = drive(body, ['BudgetExceeded']);
    expect(keysOf(result)).toEqual(['fx']);
    expect(result.outcome).toMatchObject({ kind: 'failed', error: { class: 'BudgetExceeded' } });
  });

  it('continues after a node that fails before it sends anything', () => {
    const body = seq(
      setVar('fx', {
        mode: 'set',
        to: wired('bad.value'),
        name: 'k',
        policy: { onError: 'continue' },
      }),
      effect('after'),
      compute('bad', 'test.fail', {}),
    );
    const result = drive(body, []);
    expect(keysOf(result)).toEqual(['after']);
  });

  it('hands a routed failure to the lowered catch row and goes on after the node', () => {
    const routed = tryOp('fx', seq(effect('step', {}, { policy: { onError: 'route' } })), [
      row('onError', seq(effect('handler', { e: wired('fx.error') }))),
    ]);
    const result = drive(seq(routed, effect('after')), ['Invalid']);
    expect(keysOf(result)).toEqual(['step', 'handler', 'after']);
    expect(result.requests[1]?.params['e']).toMatchObject({ class: 'Invalid' });
  });
});

describe('retry', () => {
  it('waits the backoff on a duration wait and sends a new attempt with its own key', () => {
    const result = drive(seq(effect('fx', {}, { policy: retry() }), effect('after')), [
      'Unreachable',
      'Unreachable',
      'ok',
    ]);
    expect(keysOf(result)).toEqual(['fx', 'fx', 'fx', 'after']);
    expect(result.waits.map((wait) => ('dueAt' in wait ? wait.dueAt : 0))).toEqual([
      NOW + 1000,
      NOW + 2000,
    ]);
    expect(result.waits.map((wait) => wait.nodePath)).toEqual(['body/ops/0', 'body/ops/0']);
    const attemptKeys = result.requests.slice(0, 3).map((request) => request.key);
    expect(new Set(attemptKeys).size).toBe(3);
    expect(attemptKeys.map((key) => key.split('/').at(-1))).toEqual(['a1', 'a2', 'a3']);
    expect(result.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('marks long waits durable and short ones not', () => {
    const short = drive(seq(effect('fx', {}, { policy: retry({ initial: 100 }) })), [
      'Unreachable',
    ]);
    const long = drive(seq(effect('fx', {}, { policy: retry({ initial: 30_000 }) })), [
      'Unreachable',
    ]);
    expect(short.waits[0]?.durable).toBe(false);
    expect(long.waits[0]?.durable).toBe(true);
  });

  it('fails with the last error and its attempt number when the attempts run out', () => {
    const result = drive(seq(effect('fx', {}, { policy: retry({ attempts: 2 }) })), [
      'Unreachable',
      'Unreachable',
    ]);
    expect(result.requests).toHaveLength(2);
    expect(result.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Unreachable', attempt: 2 },
    });
  });

  it('never retries Unknown, even when listed through a broader class list', () => {
    const result = drive(
      seq(effect('fx', {}, { policy: retry({ on: ['Unreachable', 'Timeout'] }) })),
      ['Unknown'],
    );
    expect(result.requests).toHaveLength(1);
    expect(result.outcome).toMatchObject({ kind: 'failed', error: { class: 'Unknown' } });
  });

  it('retries only Unreachable by default and the listed classes when given', () => {
    const refused = drive(seq(effect('fx', {}, { policy: retry() })), ['Refused']);
    expect(refused.requests).toHaveLength(1);
    const listed = drive(seq(effect('fx', {}, { policy: retry({ on: ['Refused'] }) })), [
      'Refused',
      'ok',
    ]);
    expect(listed.requests).toHaveLength(2);
    expect(listed.outcome).toMatchObject({ kind: 'done' });
  });

  it('never retries what cannot be caught', () => {
    const result = drive(seq(effect('fx', {}, { policy: retry({ on: ['BudgetExceeded'] }) })), [
      'BudgetExceeded',
    ]);
    expect(result.requests).toHaveLength(1);
  });

  it('applies onError continue only after the retries are spent', () => {
    const policy: NodePolicy = { ...retry({ attempts: 2 }), onError: 'continue' };
    const result = drive(seq(effect('fx', {}, { policy }), effect('after')), [
      'Unreachable',
      'Unreachable',
    ]);
    expect(keysOf(result)).toEqual(['fx', 'fx', 'after']);
  });

  it('retries a failing node that never sent anything', () => {
    const result = drive(
      seq(
        setVar('fx', {
          to: wired('bad.value'),
          name: 'k',
          policy: retry({ on: ['MathError'], attempts: 2 }),
        }),
        compute('bad', 'test.fail', {}),
      ),
      [],
    );
    expect(result.waits).toHaveLength(1);
    expect(result.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'MathError', attempt: 2 },
    });
  });

  it('leaves no policy record behind once the node succeeded', () => {
    const result = drive(seq(effect('fx', {}, { policy: { ...retry(), timeout: 60_000 } })), [
      'Unreachable',
      'ok',
    ]);
    expect(policyDeadline(result.state)).toBeUndefined();
    expect(JSON.stringify(result.state.frames)).not.toContain('$policy');
  });
});

describe('acknowledgeRepeat', () => {
  const relative = (policy: NodePolicy): PlanOp => effect('fx', {}, { retry: 'relative', policy });

  it('refuses a retry on a relative or external effect without acknowledgement', () => {
    const result = drive(seq(relative(retry())), []);
    expect(result.requests).toEqual([]);
    expect(result.outcome).toMatchObject({ kind: 'failed', error: { class: 'Invalid' } });
    const external = drive(seq(effect('fx', {}, { retry: 'external', policy: retry() })), []);
    expect(external.outcome).toMatchObject({ kind: 'failed', error: { class: 'Invalid' } });
  });

  it('allows it with acknowledgement and always for idempotent effects', () => {
    const acknowledged = drive(seq(relative({ ...retry(), acknowledgeRepeat: true })), [
      'Unreachable',
      'ok',
    ]);
    expect(acknowledged.requests).toHaveLength(2);
    const idempotent = drive(seq(effect('fx', {}, { policy: retry() })), ['Unreachable', 'ok']);
    expect(idempotent.requests).toHaveLength(2);
  });

  it('treats a node that is not an effect as needing acknowledgement', () => {
    const node = (policy: NodePolicy): Parameters<typeof repeatAllowed>[0] => ({
      op: 'state_op',
      at: at('st'),
      kind: 'test.state',
      ports: {},
      exits: [],
      policy,
    });
    expect(repeatAllowed(node(retry()))).toBe(false);
    expect(repeatAllowed(node({ ...retry(), acknowledgeRepeat: true }))).toBe(true);
  });

  it('reports the rule as a pure check', () => {
    const op = (
      retryClass: 'idempotent' | 'relative',
      policy: NodePolicy,
    ): Parameters<typeof repeatAllowed>[0] => {
      const built = effect('fx', {}, { retry: retryClass, policy });
      if (built.op !== 'effect') throw new Error('not an effect');
      return built;
    };
    expect(repeatAllowed(op('relative', { onError: 'continue' }))).toBe(true);
    expect(repeatAllowed(op('relative', retry()))).toBe(false);
    expect(repeatAllowed(op('idempotent', retry()))).toBe(true);
  });
});

describe('timeout', () => {
  it('exposes the activation deadline while the work is pending', () => {
    const ctx = context(planOf(seq(effect('fx', {}, { policy: { timeout: 5000 } }))));
    const first = step(ctx, stateOf(), { kind: 'start', now: NOW });
    const sent = step(ctx, first.state, { kind: 'run', now: NOW });
    expect(sent.outcome.kind).toBe('effect');
    expect(policyDeadline(sent.state)).toBe(NOW + 5000);
  });

  it('has no deadline when only a retry is set', () => {
    const ctx = context(planOf(seq(effect('fx', {}, { policy: retry() }))));
    const started = step(ctx, stateOf(), { kind: 'start', now: NOW });
    const sent = step(ctx, started.state, { kind: 'run', now: NOW });
    expect(sent.outcome.kind).toBe('effect');
    expect(policyDeadline(sent.state)).toBeUndefined();
  });

  it('raises Timeout when the driver reports the expiry and does not retry it', () => {
    const policy: NodePolicy = { timeout: 5000, ...retry({ on: ['Timeout'] }) };
    const ctx = context(planOf(seq(effect('fx', {}, { policy }))));
    const started = step(ctx, stateOf(), { kind: 'start', now: NOW });
    const sent = step(ctx, started.state, { kind: 'run', now: NOW });
    const late = step(ctx, sent.state, {
      kind: 'resolved',
      now: NOW + 5000,
      result: down('Timeout'),
    });
    expect(late.outcome).toMatchObject({ kind: 'failed', error: { class: 'Timeout' } });
  });

  it('gives up with Timeout when the next backoff would end after the deadline', () => {
    const policy: NodePolicy = { timeout: 1500, ...retry({ initial: 1000 }) };
    const result = drive(seq(effect('fx', {}, { policy })), ['Unreachable', 'Unreachable']);
    expect(result.requests).toHaveLength(2);
    expect(result.outcome).toMatchObject({
      kind: 'failed',
      error: { class: 'Timeout', cause: { class: 'Unreachable' } },
    });
  });

  it('lets onError continue absorb a timeout', () => {
    const policy: NodePolicy = { timeout: 5000, onError: 'continue' };
    const ctx = context(planOf(seq(effect('fx', {}, { policy }), effect('after'))));
    const started = step(ctx, stateOf(), { kind: 'start', now: NOW });
    const sent = step(ctx, started.state, { kind: 'run', now: NOW });
    const late = step(ctx, sent.state, {
      kind: 'resolved',
      now: NOW + 5000,
      result: down('Timeout'),
    });
    expect(late.outcome.kind).toBe('continue');
    expect(policyDeadline(late.state)).toBeUndefined();
  });
});

describe('withPolicy over handlers without a settle', () => {
  const skip = { enter: (env: Env): StepResult => next(env, env.state) };
  const ops = withPolicy({ ...CORE_OPS, state_op: skip, wait: skip });
  const node = (policy?: NodePolicy): Extract<PlanOp, { op: 'state_op' }> => ({
    op: 'state_op',
    at: at('st'),
    kind: 'test.state',
    ports: {},
    exits: [],
    ...(policy === undefined ? {} : { policy }),
  });
  const pause: PlanOp = {
    op: 'wait',
    at: at('pause'),
    durable: false,
    wait: { kind: 'duration', duration: lit(1), ifLate: 'run' },
    policy: { onError: 'continue' },
  };

  it('wraps wait and state nodes and runs them with and without a policy', () => {
    const ctx = { ...context(planOf(seq(node(), node({ onError: 'continue' }), pause))), ops };
    const trace = run(ctx, stateOf());
    expect(trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('reports a settle nobody registered as unsupported, with or without a policy', () => {
    const ctx = { ...context(planOf(seq(node()))), ops };
    const env = makeEnv(ctx, stateOf(), NOW);
    const ok: NodeResult = { ok: true, value: {} };
    for (const op of [node(), node({ onError: 'continue' })]) {
      const settled = ops.state_op?.settle?.(env, op, ok);
      expect(settled?.outcome).toMatchObject({ kind: 'failed', error: { class: 'Failed' } });
    }
  });
});

describe('withPolicy with unusual handlers', () => {
  const site = (env: Env): EffectRequest => ({
    kind: 'test.custom',
    node: env.at,
    path: env.path,
    activation: env.activation,
    key: 'k',
    params: {},
    retry: 'idempotent',
    budget: 'none',
  });
  const wait = (env: Env): Wait => ({ kind: 'breakpoint', nodePath: env.path, durable: false });
  const ops = withPolicy({
    ...CORE_OPS,
    state_op: {
      enter: (env) => stay(env, env.state, { kind: 'effect', request: site(env) }),
      settle: (env) => stay(env, env.state, { kind: 'park', wait: wait(env) }),
    },
  });
  const node: PlanOp = {
    op: 'state_op',
    at: at('st'),
    kind: 'test.custom',
    ports: {},
    exits: [],
    policy: { timeout: 9000 },
  };

  it('keeps the policy record while the settle of a node is not finished', () => {
    const ctx = { ...context(planOf(seq(node))), ops };
    const started = step(ctx, stateOf(), { kind: 'start', now: NOW });
    const sent = step(ctx, started.state, { kind: 'run', now: NOW });
    const settled = step(ctx, sent.state, {
      kind: 'resolved',
      now: NOW,
      result: { ok: true, value: {} },
    });
    expect(settled.outcome.kind).toBe('park');
    expect(policyDeadline(settled.state)).toBe(NOW + 9000);
  });

  it('settles a parked wait after a retry backoff and shows its deadline while parked', () => {
    const parking = withPolicy({
      ...CORE_OPS,
      state_op: {
        enter: (env) => stay(env, env.state, { kind: 'park', wait: wait(env) }),
        settle: (env) => next(env, env.state),
      },
    });
    const waiting: PlanOp = {
      ...node,
      policy: {
        timeout: 9000,
        acknowledgeRepeat: true,
        retry: { attempts: 3, backoff: 'fixed', initial: 100 },
      },
    };
    const ctx = { ...context(planOf(seq(waiting))), ops: parking };
    const started = step(ctx, stateOf(), { kind: 'start', now: NOW });
    const parked = step(ctx, started.state, { kind: 'run', now: NOW });
    expect(parked.outcome.kind).toBe('park');
    expect(policyDeadline(parked.state)).toBe(NOW + 9000);
    const failedWake = step(ctx, parked.state, {
      kind: 'resolved',
      now: NOW + 1,
      result: down('Unreachable'),
    });
    expect(failedWake.outcome.kind).toBe('park');
    const again = step(ctx, failedWake.state, {
      kind: 'resolved',
      now: NOW + 200,
      result: { ok: true, value: {} },
    });
    expect(again.outcome.kind).toBe('park');
    const woke = step(ctx, again.state, {
      kind: 'resolved',
      now: NOW + 300,
      result: { ok: true, value: {} },
    });
    expect(woke.outcome.kind).toBe('continue');
  });

  it('passes a completion that is not an error of the node through untouched', () => {
    const finish = withPolicy({
      state_op: { enter: (env) => completeFrame(env, { kind: 'normal' }) },
    });
    const ctx = {
      ...context(planOf(seq({ ...node, policy: { onError: 'continue' } }))),
      ops: finish,
    };
    expect(run(ctx, stateOf()).outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('adds nothing when there are no handlers to wrap', () => {
    expect(withPolicy({})).toEqual({});
  });
});

describe('backoffMs', () => {
  const base = { attempts: 9, initial: 1000 } as const;

  it('keeps fixed backoff constant and doubles exponential backoff', () => {
    expect([1, 2, 3].map((n) => backoffMs({ ...base, backoff: 'fixed' }, n, 1))).toEqual([
      1000, 1000, 1000,
    ]);
    expect([1, 2, 3].map((n) => backoffMs({ ...base, backoff: 'exponential' }, n, 1))).toEqual([
      1000, 2000, 4000,
    ]);
  });

  it('caps the delay at max', () => {
    expect(backoffMs({ ...base, backoff: 'exponential', max: 3000 }, 5, 1)).toBe(3000);
  });

  it('spreads with jitter inside half to full delay and repeats for the same seed', () => {
    const jittered = { ...base, backoff: 'fixed', jitter: true } as const;
    const values = [1, 2, 3, 4, 5, 6].map((seed) => backoffMs(jittered, 1, seed));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(500);
      expect(value).toBeLessThanOrEqual(1000);
    }
    expect(new Set(values).size).toBeGreaterThan(1);
    expect(backoffMs(jittered, 2, 9)).toBe(backoffMs(jittered, 2, 9));
  });
});
