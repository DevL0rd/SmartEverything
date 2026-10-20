import { ALL_NODE_KINDS, type FlowNode } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import type { Program } from '@smarteverything/flow/program/walk';
import { describe, expect, it } from 'vitest';
import type { InsertPoint } from '../canvas/contract';
import { automation, idSource, repeat, step, trigger } from './editor-fixtures';
import { insertOps, type InsertEnv, type InsertOutcome } from './insert';

const SNIPPET_NODES: readonly FlowNode[] = [
  step('first', { a: { lit: 1 } }),
  step('second', { b: { wire: { from: 'first', port: 'a' } } }),
];

const ENV: InsertEnv = {
  kind: (id) => ALL_NODE_KINDS.find((kind) => kind.id === id),
  snippet: (id) => (id === 'snippet:pair' ? SNIPPET_NODES : id === 'snippet:none' ? [] : undefined),
};

function point(scope: string, index: number, extra: Partial<InsertPoint> = {}): InsertPoint {
  return {
    id: `insert:${scope}:${String(index)}`,
    scope,
    index,
    placement: 'edge',
    edgeId: null,
    slotId: null,
    after: null,
    before: null,
    x: 0,
    y: 0,
    ...extra,
  };
}

function opsOf(outcome: InsertOutcome): readonly PatchOp[] {
  if (outcome.t !== 'ops') throw new Error(`expected ops, got ${outcome.t}`);
  return outcome.ops;
}

function applied(program: Program, outcome: InsertOutcome): Program {
  const result = applyPatch(program, opsOf(outcome), { newId: idSource() });
  if (!result.ok) throw new Error(`${result.code}: ${result.reason}`);
  return result.program;
}

function kindsOf(program: Program, scope = program.body.nodes): string[] {
  return scope.map((node) => node.key);
}

describe('insertOps', () => {
  it('inserts a node kind at the index of the insert point, between two steps', () => {
    const program = automation([step('a'), step('b')]);
    const outcome = insertOps(
      { source: 'node', kindId: 'flow.wait' },
      point('body', 1),
      program,
      ENV,
    );
    expect(opsOf(outcome)).toEqual([
      { op: 'add', node: { kind: 'flow.wait' }, in: 'body', index: 1 },
    ]);
    const next = applied(program, outcome);
    expect(next.body.nodes.map((node) => node.kind)).toEqual([
      'device.set',
      'flow.wait',
      'device.set',
    ]);
  });

  it('inserts at the head and at the tail of a scope', () => {
    const program = automation([step('a'), step('b')]);
    const head = applied(
      program,
      insertOps({ source: 'node', kindId: 'flow.wait' }, point('body', 0), program, ENV),
    );
    const tail = applied(
      program,
      insertOps(
        { source: 'node', kindId: 'flow.wait' },
        point('body', 2, { placement: 'tail' }),
        program,
        ENV,
      ),
    );
    expect(head.body.nodes.map((node) => node.kind)[0]).toBe('flow.wait');
    expect(tail.body.nodes.map((node) => node.kind)[2]).toBe('flow.wait');
  });

  it('inserts into a nested scope by its path and into an empty slot', () => {
    const loop = repeat('again', []);
    const program = automation([loop]);
    const next = applied(
      program,
      insertOps(
        { source: 'node', kindId: 'flow.wait' },
        point('again.body', 0, { placement: 'slot' }),
        program,
        ENV,
      ),
    );
    expect(next.body.nodes[0]?.scopes?.['body']?.nodes.map((node) => node.kind)).toEqual([
      'flow.wait',
    ]);
  });

  function inserted(kindId: string): FlowNode | undefined {
    const program = automation([]);
    const outcome = insertOps({ source: 'node', kindId }, point('body', 0), program, ENV);
    return applied(program, outcome).body.nodes[0];
  }

  it('seeds the rows an if and a switch need', () => {
    expect(inserted('flow.if')?.branches).toHaveLength(1);
    expect(inserted('flow.if')?.branches?.[0]?.when).toEqual({ lit: true });
    expect(inserted('flow.switch')?.cases).toEqual([]);
  });

  it('seeds the scopes a container kind needs', () => {
    expect(Object.keys(inserted('flow.parallel')?.scopes ?? {})).toEqual(['branch1', 'branch2']);
    expect(Object.keys(inserted('flow.try')?.scopes ?? {})).toEqual(['try']);
    expect(Object.keys(inserted('flow.repeat')?.scopes ?? {})).toEqual(['body']);
  });

  it('sends a trigger kind to the triggers list wherever the point is', () => {
    const program = automation([step('a')], [trigger('t1')]);
    const outcome = insertOps(
      { source: 'node', kindId: 'trigger.signal' },
      point('body', 1),
      program,
      ENV,
    );
    expect(opsOf(outcome)).toEqual([
      { op: 'add', node: { kind: 'trigger.signal' }, in: 'triggers' },
    ]);
    const next = applied(program, outcome);
    expect(next.kind === 'automation' ? next.triggers.length : 0).toBe(2);
    expect(kindsOf(next)).toEqual(['a']);
  });

  it('turns a preset into a device.set step with its control', () => {
    const program = automation([step('a')]);
    const outcome = insertOps(
      { source: 'preset', presetId: 'device.set.power', control: 'power' },
      point('body', 1),
      program,
      ENV,
    );
    expect(opsOf(outcome)).toEqual([
      {
        op: 'add',
        node: { kind: 'device.set', ports: { control: { lit: 'power' } } },
        in: 'body',
        index: 1,
      },
    ]);
  });

  it('turns a trigger preset into its trigger with the preset ports', () => {
    const outcome = insertOps(
      {
        source: 'trigger-preset',
        presetId: 'weather.rain_started',
        kindId: 'trigger.weather',
        ports: { event: 'rain_started' },
      },
      point('body', 0),
      automation([]),
      ENV,
    );
    expect(JSON.stringify(opsOf(outcome))).toContain(
      '"kind":"trigger.weather","ports":{"event":{"lit":"rain_started"}}',
    );
  });

  it('turns a Custom Node into a fn.call step', () => {
    const program = automation([]);
    const outcome = insertOps(
      { source: 'function', functionId: 'fn-1' },
      point('body', 0),
      program,
      ENV,
    );
    expect(opsOf(outcome)).toEqual([
      {
        op: 'add',
        node: { kind: 'fn.call', ports: { fn: { lit: 'fn-1' } } },
        in: 'body',
        index: 0,
      },
    ]);
  });

  it('inserts a snippet in order with fresh ids and re-keys clashes with references', () => {
    const program = automation([step('first'), step('last')]);
    const outcome = insertOps(
      { source: 'snippet', snippetId: 'snippet:pair' },
      point('body', 1),
      program,
      ENV,
    );
    const ops = opsOf(outcome);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ op: 'add', in: 'body', index: 1 });
    expect(ops[1]).toMatchObject({ op: 'add', in: 'body', after: 'first2' });
    const next = applied(program, outcome);
    expect(kindsOf(next)).toEqual(['first', 'first2', 'second', 'last']);
    expect(next.body.nodes[2]?.ports?.['b']).toEqual({ wire: { from: 'first2', port: 'a' } });
    const again = applied(
      next,
      insertOps({ source: 'snippet', snippetId: 'snippet:pair' }, point('body', 0), next, ENV),
    );
    expect(new Set(again.body.nodes.map((node) => node.id)).size).toBe(6);
  });

  it('reports a new Custom Node without any patch op', () => {
    expect(insertOps({ source: 'new-reusable' }, point('body', 0), automation([]), ENV)).toEqual({
      t: 'reusable',
    });
  });

  it('refuses an unknown kind, snippet or an empty snippet and says why', () => {
    const program = automation([]);
    const at = point('body', 0);
    expect(insertOps({ source: 'node', kindId: 'nope.nope' }, at, program, ENV)).toEqual({
      t: 'refused',
      reason: 'There is no step kind "nope.nope".',
    });
    expect(insertOps({ source: 'snippet', snippetId: 'snippet:x' }, at, program, ENV).t).toBe(
      'refused',
    );
    expect(insertOps({ source: 'snippet', snippetId: 'snippet:none' }, at, program, ENV).t).toBe(
      'refused',
    );
  });
});
