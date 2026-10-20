import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import type { FunctionInterface } from '../../src/functions/interface-hash';
import { applyUpdateMapping } from '../../src/functions/mapping';
import { NUMBER, TEXT, automation, call, node } from './support';

const next: FunctionInterface = {
  inputs: [
    { name: 'amount', type: NUMBER, required: true },
    { name: 'room', type: TEXT, required: true },
    { name: 'mode', type: TEXT, required: true, default: 'soft' },
  ],
  outputs: [{ name: 'result', type: NUMBER }],
  exits: ['finished', 'late'],
};

function instance(extra: Partial<FlowNode> = {}): FlowNode {
  return call('cycle', 'f1', {
    ports: { step: { wire: { from: 'trigger', port: 'value' } }, legacy: { lit: 1 } },
    scopes: {
      done: { nodes: [node('after', 'flow.wait')] },
      failed: { nodes: [node('alert', 'notify.feed')] },
    },
    ...extra,
  });
}

describe('applyUpdateMapping', () => {
  it('renames inputs, supplies new required values, routes exits and renames outputs', () => {
    const user = node('use', 'notify.feed', {
      text: { wire: { from: 'cycle', port: 'level' } },
      fixed: { lit: 'cycle.level' },
      other: { wire: { from: 'other', port: 'level' } },
    });
    const program = automation([instance(), user], {
      nodes: [node('fail', 'notify.feed', { t: { wire: { from: 'cycle', port: 'level' } } })],
    });
    const original = structuredClone(program);
    const result = applyUpdateMapping(program, 'f1', next, {
      inputs: { step: 'amount' },
      inputValues: { room: { lit: 'kitchen' } },
      exits: { done: 'finished', failed: 'late' },
      outputs: { level: 'result' },
    });
    expect(program).toEqual(original);
    expect(result.issues).toEqual([]);
    expect(result.touched).toEqual(['cycle']);
    const [cycle, used] = result.program.body.nodes;
    expect(cycle?.ports).toEqual({
      fn: { lit: 'f1' },
      amount: { wire: { from: 'trigger', port: 'value' } },
      room: { lit: 'kitchen' },
    });
    expect(Object.keys(cycle?.scopes ?? {})).toEqual(['finished', 'late']);
    expect(used?.ports).toEqual({
      text: { wire: { from: 'cycle', port: 'result' } },
      fixed: { lit: 'cycle.level' },
      other: { wire: { from: 'other', port: 'level' } },
    });
    expect(
      result.program.kind === 'automation' && result.program.onFailure?.nodes[0]?.ports,
    ).toEqual({
      t: { wire: { from: 'cycle', port: 'result' } },
    });
  });

  it('keeps outputs it was not told to rename and works without any rename table', () => {
    const user = node('use', 'notify.feed', {
      a: { wire: { from: 'cycle', port: 'level' } },
      b: { wire: { from: 'cycle', port: 'extra' } },
    });
    const result = applyUpdateMapping(
      automation([instance(), user]),
      'f1',
      {
        ...next,
        outputs: [
          { name: 'level', type: NUMBER },
          { name: 'extra', type: NUMBER },
          { name: 'more', type: NUMBER },
        ],
      },
      {
        outputs: { more: 'level' },
        inputs: { other: 'amount' },
        inputValues: { room: { lit: 'r' }, other: { lit: 1 } },
        exits: { other: 'late' },
      },
    );
    expect(result.program.body.nodes[1]?.ports).toEqual({
      a: { wire: { from: 'cycle', port: 'level' } },
      b: { wire: { from: 'cycle', port: 'extra' } },
    });
    const bare = applyUpdateMapping(
      automation([instance(), user]),
      'f1',
      {
        ...next,
        outputs: [
          { name: 'level', type: NUMBER },
          { name: 'extra', type: NUMBER },
        ],
      },
      { inputValues: { room: { lit: 'r' } } },
    );
    expect(bare.issues.map((issue) => issue.kind)).toEqual(['input', 'exit', 'exit']);
  });

  it('reports a missing value, a removed exit without a route and a dead output reference', () => {
    const program = automation([
      instance(),
      node('use', 'notify.feed', { t: { wire: { from: 'cycle', port: 'level' } } }),
    ]);
    const result = applyUpdateMapping(program, 'f1', next, {});
    expect(result.issues.map((issue) => [issue.kind, issue.name])).toEqual([
      ['output', 'level'],
      ['input', 'amount'],
      ['input', 'room'],
      ['exit', 'done'],
      ['exit', 'failed'],
    ]);
    expect(result.issues.every((issue) => issue.message.length > 0)).toBe(true);
  });

  it('merges two exits mapped to the same one and keeps exits that still exist', () => {
    const program = automation([
      instance({
        scopes: {
          done: { nodes: [node('a', 'flow.wait')] },
          failed: { nodes: [node('b', 'flow.wait')] },
          late: { nodes: [node('c', 'flow.wait')] },
        },
      }),
    ]);
    const result = applyUpdateMapping(program, 'f1', next, {
      inputs: { step: 'amount' },
      inputValues: { room: { lit: 'x' } },
      exits: { done: 'finished', failed: 'finished' },
    });
    const scopes = result.program.body.nodes[0]?.scopes ?? {};
    expect(scopes['finished']?.nodes.map((entry) => entry.key)).toEqual(['a', 'b']);
    expect(scopes['late']?.nodes.map((entry) => entry.key)).toEqual(['c']);
  });

  it('refuses a mapping onto an exit that does not exist', () => {
    const result = applyUpdateMapping(automation([instance()]), 'f1', next, {
      exits: { done: 'nowhere' },
    });
    expect(
      result.issues.filter((issue) => issue.kind === 'exit').map((issue) => issue.name),
    ).toEqual(['done', 'failed']);
    expect(Object.keys(result.program.body.nodes[0]?.scopes ?? {})).toEqual(['done', 'failed']);
  });

  it('reports two inputs that map to one name and drops inputs that no longer exist', () => {
    const two = call('c', 'f1', {
      ports: { a: { lit: 1 }, b: { lit: 2 }, gone: { lit: 3 }, amount: { lit: 1 } },
    });
    const result = applyUpdateMapping(automation([two]), 'f1', next, {
      inputs: { a: 'amount', b: 'amount' },
      inputValues: { room: { lit: 'r' } },
    });
    expect(result.issues.map((issue) => [issue.kind, issue.name])).toEqual([
      ['input', 'amount'],
      ['input', 'amount'],
    ]);
    expect(result.program.body.nodes[0]?.ports).toEqual({
      fn: { lit: 'f1' },
      amount: { lit: 1 },
      room: { lit: 'r' },
    });
  });

  it('leaves pinned instances, other functions and a node without scopes alone', () => {
    const pinned = call('pinned', 'f1', { pin: { revision: 1 }, ports: { step: { lit: 1 } } });
    const pinnedPort = call('pinnedPort', 'f1', { pinPort: 2, ports: { step: { lit: 1 } } });
    const other = call('other', 'f2', { ports: { step: { lit: 1 } } });
    const plain = call('plain', 'f1', { ports: { amount: { lit: 1 }, pin: { lit: 'x' } } });
    const program = automation([pinned, pinnedPort, other, plain, node('x', 'flow.wait')]);
    const result = applyUpdateMapping(program, 'f1', next, { inputValues: { room: { lit: 'r' } } });
    expect(result.touched).toEqual(['plain']);
    expect(result.program.body.nodes.slice(0, 3)).toEqual(program.body.nodes.slice(0, 3));
    expect(result.program.body.nodes[3]?.scopes).toBeUndefined();
    expect(result.issues).toEqual([]);
  });

  it('works on a function program and handles nodes without ports', () => {
    const bare = node('bare', 'fn.call');
    const target = call('c', 'f1', { ports: undefined });
    const result = applyUpdateMapping(
      {
        version: 3,
        kind: 'function',
        flavour: 'action',
        inputs: [],
        outputs: [],
        exits: ['done'],
        variables: [],
        body: { nodes: [bare, target] },
      },
      'f1',
      { inputs: [], outputs: [], exits: ['done'] },
      {},
    );
    expect(result.touched).toEqual(['c']);
    expect(result.issues).toEqual([]);
  });
});
