import { NODE_REGISTRY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { lower } from '../../src/compile/lower';
import type { LowerKind } from '../../src/compile/lower-effects';
import { PLAN } from '../../src/compile/plan';
import {
  automation,
  codesOf,
  context,
  fn,
  lit,
  make,
  opOf,
  opsOf,
  planOf,
  problemsOf,
  run,
  scope,
} from './support';

function withKinds(extra: Record<string, LowerKind>): typeof context {
  return { kinds: (id) => extra[id] ?? NODE_REGISTRY.get(id) };
}

describe('program shape', () => {
  it('lowers an empty automation to an empty sequence', () => {
    const plan = planOf([]);
    expect(plan).toEqual({
      version: 1,
      subject: 'automation',
      exits: [],
      variables: [],
      body: { op: 'seq', ops: [] },
      onFailure: undefined,
    });
  });

  it('keeps the variables and lowers the failure handler', () => {
    const variable = { name: 'count', type: { t: 'number' }, initial: lit(0) } as const;
    const base = automation([], scope(make('alarm', 'flow.stop')));
    const result = lower({ ...base, variables: [variable] }, context);
    expect(result.ok && result.plan.variables).toEqual([variable]);
    expect(result.ok && result.plan.onFailure).toMatchObject({
      op: 'seq',
      ops: [{ op: 'stop' }],
    });
  });

  it('lowers a function with its exits', () => {
    const result = lower(
      fn([make('done', 'flow.return', { exit: lit('ok') })], { exits: ['ok', 'bad'] }),
      context,
    );
    expect(result.ok && result.plan.subject).toBe('function');
    expect(result.ok && result.plan.exits).toEqual(['ok', 'bad']);
  });

  it('skips disabled nodes', () => {
    expect(
      opsOf([make('off', 'flow.stop', {}, { enabled: false }), make('on', 'flow.stop')]),
    ).toHaveLength(1);
  });

  it('rejects a plan that does not match the schema', () => {
    expect(PLAN.safeParse({ version: 2 }).success).toBe(false);
  });
});

describe('leaf nodes', () => {
  it('lowers a pure node to compute', () => {
    expect(opOf(make('c', 'var.constant', { value: lit(3) }))).toMatchObject({
      op: 'compute',
      kind: 'var.constant',
      ports: { value: { lit: 3 } },
      at: { key: 'c' },
    });
  });

  it('lowers a node that has no ports at all', () => {
    const bare = { id: make('x', 'var.constant').id, key: 'bare', kind: 'var.constant' };
    expect(opOf(bare)).toMatchObject({ op: 'compute', ports: {} });
  });

  it('lowers a read node with its dependency keys', () => {
    expect(
      opOf(make('v', 'var.get', { source: lit('automation'), name: lit('mood') })),
    ).toMatchObject({ op: 'read', reads: ['persistent:mood'] });
  });

  it('lowers a read node whose kind lists no dependency keys', () => {
    const kind: LowerKind = { id: 'x.read', class: 'read', inputs: [], exits: [] };
    expect(opOf(make('r', 'x.read'), withKinds({ 'x.read': kind }))).toMatchObject({
      op: 'read',
      reads: [],
    });
  });

  it('lowers an effect with its retry and budget class and node policy', () => {
    const policy = { onError: 'continue', timeout: 5000 } as const;
    expect(
      opOf(make('s', 'device.set', { target: lit('lamp'), to: lit(true) }, { policy })),
    ).toMatchObject({
      op: 'effect',
      kind: 'device.set',
      retry: 'relative',
      budget: 'command',
      policy,
      params: { target: { lit: 'lamp' }, to: { lit: true } },
    });
  });

  it('refuses an effect kind without an effect class', () => {
    const kind: LowerKind = { id: 'x.do', class: 'effect', inputs: [], exits: [] };
    const found = problemsOf([make('d', 'x.do')], withKinds({ 'x.do': kind }));
    expect(found.map((item) => item.code)).toEqual(['not_supported']);
  });

  it('lowers a stateful node to state_op with its exits', () => {
    expect(opOf(make('cool', 'timing.cooldown', { period: lit(1000) }))).toMatchObject({
      op: 'state_op',
      kind: 'timing.cooldown',
      exits: ['pass', 'blocked'],
    });
  });

  it('lowers the lanes of a stateful node by their exit name', () => {
    const lane = scope(make('told', 'flow.stop'));
    const cool = make(
      'cool',
      'timing.cooldown',
      { period: lit(1000) },
      { scopes: { blocked: lane } },
    );
    const lowered = opOf(cool);
    expect(lowered).toMatchObject({
      op: 'state_op',
      scopes: { blocked: { op: 'seq', ops: [{ op: 'stop', at: { key: 'told' } }] } },
    });
  });

  it('lowers set variable and change variable', () => {
    expect(
      opOf(make('s', 'var.set', { source: lit('home'), value: lit('mode'), to: lit('night') })),
    ).toMatchObject({
      op: 'set_var',
      mode: 'set',
      source: 'home',
      value: 'mode',
      to: { lit: 'night' },
      change: undefined,
      budget: 'effects_if_durable',
      retry: 'idempotent',
    });
    expect(
      opOf(
        make('c', 'var.change', {
          name: lit('n'),
          op: lit('add'),
          amount: lit(1),
          steps: lit([1, 2]),
        }),
      ),
    ).toMatchObject({
      op: 'set_var',
      mode: 'change',
      source: 'run',
      name: 'n',
      to: undefined,
      retry: 'relative',
      change: { op: 'add', amount: { lit: 1 }, edge: 'wrap', steps: [1, 2] },
    });
  });

  it('defaults a variable change to idempotent when its kind has no effect class', () => {
    const kind: LowerKind = { id: 'var.set', class: 'effect', inputs: [], exits: [] };
    expect(
      opOf(make('s', 'var.set', { to: lit(1) }), withKinds({ 'var.set': kind })),
    ).toMatchObject({
      retry: 'idempotent',
      budget: 'none',
    });
  });

  it('lowers a function call, taking the pin from the port or the node', () => {
    expect(opOf(make('f', 'fn.call', { fn: lit('f1'), pin: lit(3), a: lit(1) }))).toMatchObject({
      op: 'call',
      fn: 'f1',
      pin: 3,
      detached: false,
      inputs: { a: { lit: 1 } },
    });
    expect(opOf(make('g', 'fn.call', { fn: lit('f1') }, { pin: { revision: 2 } }))).toMatchObject({
      pin: 2,
      inputs: {},
    });
  });

  it('lowers run automation as detached', () => {
    expect(
      opOf(make('r', 'automation.run', { automation: lit('a1'), wait: lit(true), x: lit(1) })),
    ).toMatchObject({
      op: 'run',
      automation: 'a1',
      wait: true,
      allowSelf: false,
      detached: true,
      inputs: { x: { lit: 1 } },
    });
  });

  it('lowers a breakpoint', () => {
    expect(opOf(make('b', 'debug.breakpoint'))).toMatchObject({ op: 'breakpoint' });
  });
});

describe('routed errors', () => {
  const handler = scope(make('note', 'flow.stop'));

  it('wraps a routed node in a try that runs the error scope', () => {
    const routed = make(
      's',
      'device.set',
      {},
      { policy: { onError: 'route' }, scopes: { onError: handler } },
    );
    const op = opOf(routed);
    expect(op).toMatchObject({
      op: 'try',
      at: { key: 's' },
      body: { op: 'effect' },
      catches: [{ id: routed.id, then: { op: 'seq', ops: [{ op: 'stop' }] } }],
    });
  });

  it('leaves a routed node alone when it has no error scope', () => {
    expect(opOf(make('s', 'device.set', {}, { policy: { onError: 'route' } }))).toMatchObject({
      op: 'effect',
    });
  });

  it('leaves a node alone when it does not route', () => {
    expect(
      opOf(
        make(
          's',
          'device.set',
          {},
          { policy: { onError: 'continue' }, scopes: { onError: handler } },
        ),
      ),
    ).toMatchObject({ op: 'effect' });
  });

  it('keeps the error scope out of the branches of a parallel node', () => {
    const routed = make(
      'p',
      'flow.parallel',
      {},
      {
        policy: { onError: 'route' },
        scopes: { a: scope(), b: scope(), onError: handler },
      },
    );
    const op = opOf(routed);
    expect(op).toMatchObject({ op: 'try', body: { op: 'parallel' } });
    expect(op.op === 'try' && op.body.op === 'parallel' && op.body.branches).toHaveLength(2);
  });
});

describe('problems', () => {
  it('refuses an unknown kind', () => {
    const [problem] = problemsOf([make('x', 'nothing.here')]);
    expect(problem).toMatchObject({ code: 'unknown_kind', key: 'x', received: 'nothing.here' });
  });

  it('refuses a trigger kind in the body', () => {
    const [problem] = problemsOf([make('t', 'trigger.called')]);
    expect(problem).toMatchObject({ code: 'not_supported', received: 'trigger' });
  });

  it('refuses a control kind it has no lowering for', () => {
    const kind: LowerKind = { id: 'x.ctl', class: 'control', inputs: [], exits: [] };
    expect(codesOf([make('c', 'x.ctl')], withKinds({ 'x.ctl': kind }))).toEqual(['not_supported']);
  });

  it('reports every problem at once, including inside containers', () => {
    const inside = make('b', 'nothing.here');
    const body = make('l', 'flow.repeat', { times: lit(2) }, { scopes: { body: scope(inside) } });
    expect(codesOf([make('a', 'nothing.else'), body, make('t', 'trigger.called')])).toEqual([
      'unknown_kind',
      'unknown_kind',
      'not_supported',
    ]);
  });

  it('does not produce a plan when there is a problem', () => {
    expect(run([make('x', 'nothing.here')]).ok).toBe(false);
  });
});
