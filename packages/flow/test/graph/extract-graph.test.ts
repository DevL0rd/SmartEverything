import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { extractFromGraph, type GraphExtractResult } from '../../src/graph/extract-graph';
import { context } from '../check/c23-support';
import { automation, graphNode, idOf, ifNode, join, start, step, together } from './graph-fixtures';

const FUNCTION_ID = '33333333-3333-4333-8333-333333333333';
const CALL_ID = '44444444-4444-4444-8444-444444444444';

const notify = (key: string, next?: string, label?: string): GraphNode =>
  graphNode(key, 'notify.feed', {
    ports: { message: { lit: 'hello' } },
    ...(next === undefined ? {} : { to: { next } }),
    ...(label === undefined ? {} : { label }),
  });

function extract(program: ProgramV4, selection: readonly string[]): GraphExtractResult {
  return extractFromGraph(program, selection, context(), {
    functionId: FUNCTION_ID,
    name: 'Make tea',
    newId: () => CALL_ID,
  });
}

function refused(result: GraphExtractResult): { code: string; reason: string } {
  if (result.ok) throw new Error('expected a refusal');
  return result;
}

const forked = (): ProgramV4 =>
  automation([
    start('both'),
    together('both', [
      { name: 'one', to: 'x' },
      { name: 'two', to: 'y' },
    ]),
    notify('x', 'sync'),
    notify('y', 'sync'),
    join('sync', 'after'),
    notify('after'),
  ]);

const chain = (): ProgramV4 =>
  automation([start('one'), notify('one', 'two'), notify('two', 'three'), notify('three')]);

describe('extractFromGraph allowed', () => {
  it('extracts one connected chain with one way in and one way out', () => {
    const result = extract(chain(), ['one', 'two']);
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.callee.body.nodes.map((node) => node.key)).toEqual(['one', 'two']);
    expect(result.caller.body.nodes.map((node) => node.key)).toEqual(['makeTea', 'three']);
    expect(result.instanceKey).toBe('makeTea');
  });

  it('keeps the ids of the nodes that stay and gives the call node the new id', () => {
    const result = extract(chain(), ['two', 'three']);
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    const [first, call] = result.caller.body.nodes;
    expect(first?.id).toBe(idOf('one'));
    expect(call).toMatchObject({ id: CALL_ID, kind: 'fn.call', key: 'makeTea' });
    expect(result.callee.body.nodes.map((node) => node.id)).toContain(idOf('two'));
  });

  it('extracts a whole Do together with its Wait for all', () => {
    const result = extract(forked(), ['both', 'x', 'y', 'sync']);
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(result.callee.body.nodes.map((node) => node.key)).toContain('both');
    expect(result.caller.body.nodes.map((node) => node.key)).toEqual(['makeTea', 'after']);
  });
});

describe('extractFromGraph refusals', () => {
  it('names the wire that enters the middle of the selection', () => {
    const program = automation([
      start('decide'),
      ifNode('decide', [{ name: 'yes', to: 'one' }], 'two'),
      notify('one', 'two'),
      notify('two', undefined, 'Notify'),
    ]);
    const result = refused(extract(program, ['one', 'two']));
    expect(result.code).toBe('wire_in');
    expect(result.reason).toBe('Notify has a wire from outside the selection into the middle');
  });

  it('refuses two ways out to different steps', () => {
    const program = automation([
      start('decide'),
      ifNode('decide', [{ name: 'yes', to: 'x' }], 'y'),
      notify('x'),
      notify('y'),
    ]);
    const result = refused(extract(program, ['decide']));
    expect(result.code).toBe('wire_out');
    expect(result.reason).toContain('lead out of the selection to different steps');
  });

  it('refuses steps that are not wired together', () => {
    const result = refused(extract(chain(), ['one', 'three']));
    expect(result.code).toBe('disconnected');
    expect(result.reason).toContain('are not wired together');
  });

  it('refuses Start and a Wait for all without its Do together', () => {
    const program = automation([
      start('both'),
      together('both', [{ name: 'one', to: 'x' }]),
      notify('x', 'sync'),
      join('sync'),
    ]);
    expect(refused(extract(program, ['start'])).code).toBe('structural_node');
    expect(refused(extract(program, ['sync'])).code).toBe('structural_node');
  });

  it('refuses a Do together without the steps on its paths', () => {
    expect(refused(extract(forked(), ['both'])).code).toBe('wire_out');
  });

  it('refuses a key that is not in the program', () => {
    expect(refused(extract(chain(), ['nowhere'])).code).toBe('unknown_key');
  });

  it('asks for the structure problems to be fixed first', () => {
    const program = automation([start('one'), notify('one'), step('lonely')]);
    const result = refused(extract(program, ['one']));
    expect(result.code).toBe('structure');
    expect(result.reason).toBe('Fix 1 problems before making a Custom Node');
  });

  it('passes on the refusal of the structured extraction', () => {
    const result = refused(extract(chain(), []));
    expect(result.code).toBe('empty');
  });
});
