import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { AutomationV3, FlowNode, GraphNode, PortValue } from '@smarteverything/domain';
import { canonicalise, placeValues, type PlacedTree } from '../../src/graph/place-values';
import { pathKey, structureProgram } from '../../src/graph/structure';
import {
  automation,
  flow,
  graphNode,
  idOf,
  ifNode,
  loop,
  plain,
  scope,
  start,
  step,
  switchNode,
  value,
} from './graph-fixtures';

const read = (from: string, port = 'value'): PortValue => ({ wire: { from, port } });

const consumer = (key: string, next: string | undefined, from: string): GraphNode =>
  step(key, next, { ports: { to: read(from) } });

const reader = (key: string, from: string): FlowNode => plain(key, { ports: { to: read(from) } });

const compare = (key: string, from: string, port = 'value'): GraphNode =>
  graphNode(key, 'logic.compare', { ports: { a: read(from, port) } });

const keys = (nodes: readonly FlowNode[]): string[] => nodes.map((node) => node.key);

function placed(nodes: readonly GraphNode[]): PlacedTree {
  const result = structureProgram(automation(nodes), STATIC_KIND_LOOKUP);
  if (!result.ok) throw new Error(result.problems.map((p) => p.message).join(' | '));
  return placeValues(result, STATIC_KIND_LOOKUP);
}

function bodyKeys(nodes: readonly GraphNode[]): string[] {
  return keys(placed(nodes).tree.body.nodes);
}

describe('value placement', () => {
  it('puts a value just before its first consumer', () => {
    expect(
      bodyKeys([
        start('a'),
        step('a', 'b'),
        consumer('b', 'c', 'v'),
        consumer('c', undefined, 'v'),
        value('v'),
      ]),
    ).toEqual(['a', 'v', 'b', 'c']);
  });

  it('puts a value inside the loop body when only the body reads it', () => {
    const { tree } = placed([
      start('l'),
      loop('l', 'flow.for_each', 'x', 'after'),
      consumer('x', undefined, 'v'),
      step('after'),
      value('v'),
    ]);
    expect(keys(tree.body.nodes)).toEqual(['l', 'after']);
    expect(keys(tree.body.nodes[0]?.scopes?.['body']?.nodes ?? [])).toEqual(['v', 'x']);
  });

  it('puts a value before the loop when the loop and a later step both read it', () => {
    const { tree } = placed([
      start('l'),
      loop('l', 'flow.for_each', 'x', 'after'),
      consumer('x', undefined, 'v'),
      consumer('after', undefined, 'v'),
      value('v'),
    ]);
    expect(keys(tree.body.nodes)).toEqual(['v', 'l', 'after']);
  });

  it('puts a value read by two branches before the If', () => {
    const { tree } = placed([
      start('pre'),
      step('pre', 'decide'),
      ifNode('decide', [{ name: 'yes', to: 'x' }], 'y'),
      consumer('x', undefined, 'v'),
      consumer('y', undefined, 'v'),
      value('v'),
    ]);
    expect(keys(tree.body.nodes)).toEqual(['pre', 'v', 'decide']);
  });

  it('puts the For each collect value at the end of the Each item lane', () => {
    const each: GraphNode = {
      ...loop('l', 'flow.for_each', 'x', 'after'),
      ports: { collect: read('v') },
    };
    const { tree } = placed([
      start('l'),
      each,
      step('x', 'y'),
      step('y'),
      step('after'),
      value('v'),
    ]);
    expect(keys(tree.body.nodes)).toEqual(['l', 'after']);
    expect(keys(tree.body.nodes[0]?.scopes?.['body']?.nodes ?? [])).toEqual(['x', 'y', 'v']);
  });

  it('puts a structured output value at the end of its branch', () => {
    const decide: GraphNode = {
      ...ifNode('decide', [{ name: 'yes', to: 'x' }], 'm'),
      outputs: [{ name: 'level', values: { [idOf('decide:yes')]: read('v') } }],
    };
    const { tree } = placed([start('decide'), decide, step('x', 'm'), step('m'), value('v')]);
    const row = tree.body.nodes[0]?.branches?.[0]?.scope;
    expect(keys(row?.nodes ?? [])).toEqual(['x', 'v']);
    expect(tree.body.nodes[0]?.scopes).toBeUndefined();
  });

  it('orders a value before the value that reads it', () => {
    expect(
      bodyKeys([start('a'), consumer('a', undefined, 'w'), compare('w', 'v'), value('v')]),
    ).toEqual(['v', 'w', 'a']);
  });

  it('keeps a value after the step whose output it reads', () => {
    expect(
      bodyKeys([
        start('first'),
        step('first', 'second'),
        consumer('second', undefined, 'w'),
        compare('w', 'first', 'result'),
      ]),
    ).toEqual(['first', 'w', 'second']);
  });
});

describe('values nobody reads', () => {
  it('go to the start of the body', () => {
    expect(bodyKeys([start('a'), step('a'), value('loose')])).toEqual(['loose', 'a']);
  });

  it('go to the start of the lane whose loop value they read', () => {
    const { tree } = placed([
      start('l'),
      loop('l', 'flow.for_each', 'x'),
      step('x'),
      compare('loose', 'l', 'item'),
    ]);
    expect(keys(tree.body.nodes)).toEqual(['l']);
    expect(keys(tree.body.nodes[0]?.scopes?.['body']?.nodes ?? [])).toEqual(['loose', 'x']);
  });

  it('follow the loop value read by a value they feed', () => {
    const { tree } = placed([
      start('l'),
      loop('l', 'flow.for_each', 'x'),
      step('x'),
      compare('outer', 'inner'),
      compare('inner', 'l', 'item'),
    ]);
    expect(keys(tree.body.nodes[0]?.scopes?.['body']?.nodes ?? [])).toEqual([
      'inner',
      'outer',
      'x',
    ]);
  });
});

describe('empty Otherwise and Default scopes', () => {
  it('are absent when the branch goes straight to the merge and nothing needs them', () => {
    const { tree } = placed([
      start('decide'),
      ifNode('decide', [{ name: 'yes', to: 'x' }], 'm'),
      step('x', 'm'),
      step('m'),
    ]);
    expect(tree.body.nodes[0]?.scopes).toBeUndefined();
  });

  it('are present when a structured output gives them a value', () => {
    const decide: GraphNode = {
      ...ifNode('decide', [{ name: 'yes', to: 'x' }], 'm'),
      outputs: [{ name: 'level', values: { [idOf('decide:yes')]: { lit: 1 }, else: read('v') } }],
    };
    const { tree, map } = placed([start('decide'), decide, step('x', 'm'), step('m'), value('v')]);
    expect(tree.body.nodes[0]?.scopes).toEqual({ else: scope(flow('v', 'device.get')) });
    expect(map.get(pathKey(['body', 'nodes', 0, 'scopes', 'else', 'nodes', 0]))).toMatchObject({
      key: 'v',
    });
    expect(map.get(pathKey(['body', 'nodes', 0, 'scopes', 'else']))).toMatchObject({
      key: 'decide',
      port: 'else',
    });
  });

  it('are present on a Switch with a default output value', () => {
    const pick: GraphNode = {
      ...switchNode('pick', [{ name: 'a', to: 'x' }], 'm'),
      outputs: [{ name: 'level', values: { default: read('v') } }],
    };
    const { tree } = placed([start('pick'), pick, step('x', 'm'), step('m'), value('v')]);
    expect(tree.body.nodes[0]?.scopes).toEqual({ default: scope(flow('v', 'device.get')) });
  });
});

describe('the structure map after placement', () => {
  it('follows the nodes that moved and names the values', () => {
    const { map } = placed([start('a'), step('a', 'b'), consumer('b', undefined, 'v'), value('v')]);
    expect(map.get(pathKey(['body', 'nodes', 0]))).toMatchObject({ key: 'a' });
    expect(map.get(pathKey(['body', 'nodes', 1]))).toMatchObject({ key: 'v' });
    expect(map.get(pathKey(['body', 'nodes', 2]))).toMatchObject({ key: 'b' });
    expect(map.get(pathKey(['body']))).toMatchObject({ key: 'start' });
  });

  it('shifts the paths of nodes inside lanes that received values', () => {
    const { map } = placed([
      start('l'),
      loop('l', 'flow.for_each', 'x'),
      consumer('x', undefined, 'v'),
      value('v'),
    ]);
    expect(map.get(pathKey(['body', 'nodes', 0, 'scopes', 'body', 'nodes', 0]))).toMatchObject({
      key: 'v',
    });
    expect(map.get(pathKey(['body', 'nodes', 0, 'scopes', 'body', 'nodes', 1]))).toMatchObject({
      key: 'x',
    });
  });
});

function treeOf(...nodes: FlowNode[]): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: scope(...nodes),
    policy: { mode: 'single' },
  };
}

describe('canonicalise', () => {
  it('moves value nodes to their canonical place', () => {
    const tree = treeOf(
      flow('v', 'device.get'),
      plain('a'),
      reader('b', 'v'),
      flow('stray', 'device.get'),
    );
    expect(keys(canonicalise(tree, STATIC_KIND_LOOKUP).body.nodes)).toEqual([
      'stray',
      'a',
      'v',
      'b',
    ]);
  });

  it('does not touch the tree it is given', () => {
    const tree = treeOf(flow('v', 'device.get'), plain('a'), reader('b', 'v'));
    canonicalise(tree, STATIC_KIND_LOOKUP);
    expect(keys(tree.body.nodes)).toEqual(['v', 'a', 'b']);
  });

  it('drops an empty Otherwise without a structured output and keeps one with a value', () => {
    const row = { id: idOf('decide:yes'), when: { lit: true }, scope: scope(plain('x')) };
    const bare = flow('decide', 'flow.if', { branches: [row], scopes: { else: scope() } });
    const valued = flow('decide', 'flow.if', {
      branches: [row],
      scopes: { else: scope() },
      outputs: [{ name: 'level', values: { else: { lit: 1 } } }],
    });
    expect(canonicalise(treeOf(bare), STATIC_KIND_LOOKUP).body.nodes[0]?.scopes).toBeUndefined();
    expect(canonicalise(treeOf(valued), STATIC_KIND_LOOKUP).body.nodes[0]?.scopes).toEqual({
      else: scope(),
    });
  });

  it('drops an Otherwise that only held a value that moves elsewhere', () => {
    const row = { id: idOf('decide:yes'), when: { lit: true }, scope: scope(plain('x')) };
    const decide = flow('decide', 'flow.if', {
      branches: [row],
      scopes: { else: scope(flow('v', 'device.get')) },
    });
    const tree = treeOf(decide, reader('after', 'v'));
    const result = canonicalise(tree, STATIC_KIND_LOOKUP);
    expect(keys(result.body.nodes)).toEqual(['decide', 'v', 'after']);
    expect(result.body.nodes[0]?.scopes).toBeUndefined();
  });

  it('moves the steps of the only branch that continues out after the decision', () => {
    const row = {
      id: idOf('decide:yes'),
      when: { lit: true },
      scope: scope(plain('hush'), flow('leave', 'flow.return')),
    };
    const decide = flow('decide', 'flow.if', {
      branches: [row],
      scopes: { else: scope(plain('first'), plain('second')) },
    });
    const result = canonicalise(treeOf(decide, plain('after')), STATIC_KIND_LOOKUP);
    expect(keys(result.body.nodes)).toEqual(['decide', 'first', 'second', 'after']);
    expect(result.body.nodes[0]?.scopes).toBeUndefined();
    expect(keys(result.body.nodes[0]?.branches?.[0]?.scope.nodes ?? [])).toEqual(['hush', 'leave']);
  });

  it('keeps the steps in place while two branches continue', () => {
    const row = { id: idOf('decide:yes'), when: { lit: true }, scope: scope(plain('hush')) };
    const decide = flow('decide', 'flow.if', {
      branches: [row],
      scopes: { else: scope(plain('first')) },
    });
    const result = canonicalise(treeOf(decide), STATIC_KIND_LOOKUP);
    expect(keys(result.body.nodes)).toEqual(['decide']);
    expect(keys(result.body.nodes[0]?.scopes?.['else']?.nodes ?? [])).toEqual(['first']);
  });

  it('is what the structure pass produces for the same program', () => {
    const { tree } = placed([
      start('a'),
      step('a', 'b'),
      consumer('b', 'c', 'w'),
      consumer('c', undefined, 'v'),
      compare('w', 'v'),
      value('v'),
    ]);
    expect(canonicalise(tree, STATIC_KIND_LOOKUP)).toEqual(tree);
  });
});
