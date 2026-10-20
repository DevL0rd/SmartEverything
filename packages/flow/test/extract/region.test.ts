import type { FlowNode, PortValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { indexProgram } from '../../src/program/lookup';
import { formatScopePath } from '../../src/program/paths';
import type { Program } from '../../src/program/walk';
import type { Region } from '../../src/extract/region';
import { resolveRegion, subtreeKeys } from '../../src/extract/region';
import { ExtractRefusal } from '../../src/extract/result';
import { uuid } from '../check/c23-support';
import { CTX, automation, wired, functionProgram, lit, node, probe, trigger } from './support';

function regionOf(program: Program, selection: readonly string[]): Region {
  return resolveRegion(indexProgram(program), selection, CTX.kinds);
}

function refusalOf(program: Program, selection: readonly string[]): ExtractRefusal {
  try {
    regionOf(program, selection);
  } catch (error) {
    if (error instanceof ExtractRefusal) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

function pure(key: string, reads?: string): FlowNode {
  const first: PortValue = reads === undefined ? lit(1) : wired(reads);
  return node(key, 'math.add', { a: first, b: lit(1) });
}

function branching(key: string, inside: FlowNode[]): FlowNode {
  return {
    ...node(key, 'flow.if'),
    branches: [{ id: uuid(), when: lit(true), scope: { nodes: inside } }],
  };
}

function looping(key: string, inside: FlowNode[]): FlowNode {
  return { ...node(key, 'flow.repeat', { times: lit(2) }), scopes: { body: { nodes: inside } } };
}

describe('resolveRegion', () => {
  it('describes a single node at the end of the body', () => {
    const region = regionOf(automation([probe('a'), probe('b')]), ['b']);
    expect(region.nodes.map((entry) => entry.key)).toEqual(['b']);
    expect(region.position).toBe(1);
    expect(region.atEnd).toBe(true);
    expect(region.root).toBe(true);
    expect([...region.keys]).toEqual(['b']);
  });

  it('ignores repeated keys and keys nested in a selected container', () => {
    const program = automation([looping('rep', [probe('inner')]), probe('after')]);
    const region = regionOf(program, ['rep', 'inner', 'rep']);
    expect(region.nodes.map((entry) => entry.key)).toEqual(['rep']);
    expect([...region.keys]).toEqual(['rep', 'inner']);
    expect(region.atEnd).toBe(false);
  });

  it('keeps the order of the scope and finds nested scopes', () => {
    const program = automation([looping('rep', [probe('a'), probe('b'), probe('c')])]);
    const region = regionOf(program, ['b', 'a']);
    expect(region.nodes.map((entry) => entry.key)).toEqual(['a', 'b']);
    expect(region.root).toBe(false);
    expect(region.atEnd).toBe(false);
    expect(formatScopePath(region.scope)).toBe('rep.body');
  });

  it('refuses an empty selection, unknown keys, triggers and unknown kinds', () => {
    const program = {
      ...automation([probe('a'), node('weird', 'no.such', {})]),
      triggers: [trigger('press', 'trigger.signal')],
    };
    expect(refusalOf(program, []).code).toBe('empty');
    expect(refusalOf(program, ['nope']).code).toBe('unknown_key');
    expect(refusalOf(program, ['press']).code).toBe('trigger');
    expect(refusalOf(program, ['a', 'weird']).code).toBe('unknown_kind');
  });

  it('suggests the smallest range when steps are not next to each other', () => {
    const program = automation([probe('a'), pure('mid'), probe('b'), probe('c')]);
    const refused = refusalOf(program, ['a', 'c']);
    expect(refused.code).toBe('scattered');
    expect(refused.suggestion).toEqual(['a', 'b', 'c']);
  });

  it('accepts steps with only a node of no steps between them', () => {
    const program = automation([probe('a'), pure('mid'), probe('b')]);
    expect(regionOf(program, ['a', 'b']).nodes.map((entry) => entry.key)).toEqual(['a', 'b']);
  });

  it('lifts a selection that reaches into different scopes to the container', () => {
    const program = automation([probe('a'), branching('cond', [probe('x')]), probe('z')]);
    const refused = refusalOf(program, ['a', 'x']);
    expect(refused.code).toBe('scattered');
    expect(refused.suggestion).toEqual(['a', 'cond']);
  });

  it('refuses a selection across the body and the failure handler', () => {
    const program = automation([probe('a')], { onFailure: { nodes: [probe('h')] } });
    expect(refusalOf(program, ['a', 'h']).code).toBe('scattered');
  });

  it('takes a selection of only pure nodes as it is', () => {
    const program = automation([pure('p'), pure('q'), probe('a')]);
    const region = regionOf(program, ['p', 'q']);
    expect(region.nodes.map((entry) => entry.key)).toEqual(['p', 'q']);
    expect(region.atEnd).toBe(false);
  });

  it('pulls in pure nodes that only the region reads, and their own inputs', () => {
    const program = automation([
      pure('base'),
      pure('mid', 'base.result'),
      probe('a', { label: wired('mid.result') }),
      probe('b'),
    ]);
    const region = regionOf(program, ['a']);
    expect(region.nodes.map((entry) => entry.key)).toEqual(['base', 'mid', 'a']);
    expect(region.position).toBe(2);
  });

  it('leaves pure nodes that others read outside the region', () => {
    const program = automation([
      pure('shared'),
      probe('a', { label: wired('shared.result') }),
      probe('b', { label: wired('shared.result') }),
    ]);
    expect(regionOf(program, ['a']).nodes.map((entry) => entry.key)).toEqual(['a']);
  });

  it('leaves pure nodes that the program level reads outside the region', () => {
    const program = {
      ...automation([pure('shared'), probe('a', { label: wired('shared.result') })]),
      admit: wired('shared.result'),
    };
    expect(regionOf(program, ['a']).nodes.map((entry) => entry.key)).toEqual(['a']);
  });

  it('leaves a pure node nobody reads outside the region', () => {
    const program = automation([pure('lonely'), probe('a')]);
    expect(regionOf(program, ['a']).nodes.map((entry) => entry.key)).toEqual(['a']);
  });

  it('works inside functions', () => {
    const region = regionOf(functionProgram([probe('a'), probe('b')]), ['a']);
    expect(region.atEnd).toBe(false);
  });
});

describe('subtreeKeys', () => {
  it('lists a node and everything below it', () => {
    const tree: FlowNode = {
      ...looping('rep', [probe('a')]),
      catches: [{ id: uuid(), scope: { nodes: [probe('c')] } }],
      cases: [{ id: uuid(), match: { eq: 1 }, scope: { nodes: [probe('d')] } }],
      branches: [{ id: uuid(), when: lit(true), scope: { nodes: [probe('e')] } }],
    };
    expect(subtreeKeys(tree)).toEqual(['rep', 'a', 'e', 'd', 'c']);
  });
});
