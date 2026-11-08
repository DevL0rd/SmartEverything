import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { readFileSync, readdirSync } from 'node:fs';
import { STARTER_NODES, ERROR_EXIT_PORT, NODE_REGISTRY, PROGRAM_V3 } from '@smarteverything/domain';
import type { FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { lower } from '../../src/compile/lower';
import type { Lowering } from '../../src/compile/lower-effects';
import { policyOf, routeOnError } from '../../src/compile/lower-effects';
import type { PlanOp } from '../../src/compile/plan';
import { structuredOf } from '../../src/graph/structured-of';
import type { Program } from '../../src/program/walk';
import { walkProgram } from '../../src/program/walk';
import { make, opOf, scope } from './support';

const HANDLER: PlanOp = {
  op: 'seq',
  ops: [
    { op: 'stop', at: { id: 'x', key: 'x' }, message: undefined, failed: false, cancelSelf: false },
  ],
};

const low: Lowering = {
  frame: { loops: [], durable: true },
  report: () => undefined,
  scope: () => HANDLER,
};

const EFFECT: PlanOp = { op: 'breakpoint', at: { id: 'e', key: 'e' } };

function starterTrees(): readonly [string, Program][] {
  return STARTER_NODES.map((starter): [string, Program] => {
    const structured = structuredOf(starter.program, STATIC_KIND_LOOKUP);
    if (structured.kind !== 'structured') throw new Error(starter.name);
    return [starter.name, structured.tree];
  });
}

function fixtureTrees(): readonly [string, Program][] {
  const folder = new URL('../graph/fixtures/', import.meta.url);
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .map((name) => [
      name,
      PROGRAM_V3.parse(JSON.parse(readFileSync(new URL(name, folder), 'utf8'))),
    ]);
}

describe('routeOnError', () => {
  const handler = scope(make('note', 'flow.stop'));

  it('routes a wired error exit even when the node policy does not say route', () => {
    for (const policy of [
      undefined,
      { onError: 'fail' } as const,
      { onError: 'continue' } as const,
    ]) {
      const node = make(
        's',
        'device.set',
        {},
        {
          ...(policy === undefined ? {} : { policy }),
          scopes: { [ERROR_EXIT_PORT]: handler },
        },
      );
      expect(routeOnError(node, EFFECT, low)).toEqual({
        op: 'try',
        at: { id: node.id, key: 's' },
        body: EFFECT,
        catches: [{ id: node.id, then: HANDLER }],
      });
    }
  });

  it('builds exactly the try the compiler builds today for a routed node', () => {
    const routed = make(
      's',
      'device.set',
      {},
      { policy: { onError: 'route' }, scopes: { onError: handler } },
    );
    const today = opOf(routed);
    if (today.op !== 'try') throw new Error('expected a try');
    const [row] = today.catches;
    if (row === undefined) throw new Error('expected a catch');
    expect(routeOnError(routed, today.body, { ...low, scope: () => row.then })).toEqual(today);
  });

  it('keeps today’s policy for an unwired exit, route included', () => {
    for (const policy of [
      undefined,
      { onError: 'route' } as const,
      { onError: 'continue' } as const,
    ]) {
      const node: FlowNode = make('s', 'device.set', {}, policy === undefined ? {} : { policy });
      expect(routeOnError(node, EFFECT, low)).toBe(EFFECT);
    }
  });

  it('leaves every starter Custom Node and graph fixture plan identical', () => {
    const trees = [...starterTrees(), ...fixtureTrees()];
    expect(trees.length).toBeGreaterThan(20);
    for (const [name, tree] of trees) {
      expect(lower(tree, { kinds: (id) => NODE_REGISTRY.get(id) }).ok, name).toBe(true);
      for (const { node } of walkProgram(tree)) {
        expect(routeOnError(node, EFFECT, low), `${name} ${node.key}`).toBe(EFFECT);
        expect(policyOf(node), `${name} ${node.key}`).toBe(node.policy);
      }
    }
  });
});

function effectOf(op: PlanOp): Extract<PlanOp, { op: 'effect' }> {
  const inner = op.op === 'try' ? op.body : op;
  if (inner.op !== 'effect') throw new Error('expected an effect');
  return inner;
}

describe('policyOf', () => {
  const handler = scope(make('note', 'flow.stop'));

  it('routes a wired exit so continue no longer swallows the failure', () => {
    const node = make(
      's',
      'device.set',
      {},
      {
        policy: {
          onError: 'continue',
          timeout: 5000,
          retry: { attempts: 2, backoff: 'fixed', initial: 100 },
        },
        scopes: { [ERROR_EXIT_PORT]: handler },
      },
    );
    expect(policyOf(node)).toEqual({
      onError: 'route',
      timeout: 5000,
      retry: { attempts: 2, backoff: 'fixed', initial: 100 },
    });
    expect(effectOf(opOf(node)).policy?.onError).toBe('route');
  });

  it('lowers a continue node with a wired exit into a try that runs the handler', () => {
    const node = make(
      's',
      'device.set',
      {},
      { policy: { onError: 'continue' }, scopes: { [ERROR_EXIT_PORT]: handler } },
    );
    const op = opOf(node);
    if (op.op !== 'try') throw new Error('expected a try');
    expect(op.at).toEqual({ id: node.id, key: 's' });
    expect(op.catches).toHaveLength(1);
    expect(op.catches[0]?.id).toBe(node.id);
    expect(op.catches[0]?.then).toMatchObject({ op: 'seq', ops: [{ op: 'stop' }] });
    expect(effectOf(op).policy).toEqual({ onError: 'route' });
  });

  it('lowers a wired exit without a policy into the same try', () => {
    const node = make('s', 'device.set', {}, { scopes: { [ERROR_EXIT_PORT]: handler } });
    const op = opOf(node);
    expect(op.op).toBe('try');
    expect(effectOf(op).policy).toBeUndefined();
  });

  it('leaves a wired node without a policy without one', () => {
    const node = make('s', 'device.set', {}, { scopes: { [ERROR_EXIT_PORT]: handler } });
    expect(policyOf(node)).toBeUndefined();
  });

  it('keeps the very same policy for an unwired node', () => {
    const policy = { onError: 'continue', timeout: 5000 } as const;
    const node = make('s', 'device.set', {}, { policy });
    expect(policyOf(node)).toBe(policy);
    expect(effectOf(opOf(node)).policy).toBe(policy);
  });
});
