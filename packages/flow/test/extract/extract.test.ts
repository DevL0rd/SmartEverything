import type { FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { detachInstance } from '../../src/extract/detach';
import { extractRegion } from '../../src/extract/extract';
import {
  CTX,
  FUNCTION_ID,
  automation,
  giveBack,
  branching,
  wired,
  extracted,
  functionProgram,
  keysOf,
  lit,
  node,
  probe,
  pure,
  refusal,
  repeating,
  withPress,
} from './support';

describe('extractRegion', () => {
  it('moves the steps into a reusable node and calls it', () => {
    const program = withPress(
      automation([
        probe('first', { label: wired('trigger.subject') }),
        probe('second', { count: wired('first.out') }),
        probe('third', { count: wired('second.out') }),
      ]),
    );
    const result = extracted(program, ['first', 'second']);
    expect(result.callee.flavour).toBe('action');
    expect(result.callee.exits).toEqual(['done']);
    expect(result.callee.inputs.map((port) => port.name)).toEqual(['triggerSubject']);
    expect(result.callee.outputs.map((port) => port.name)).toEqual(['secondOut']);
    expect(keysOf(result.callee)).toEqual(['first', 'second', 'finish']);
    expect(keysOf(result.caller)).toEqual(['makeTea', 'third']);
    expect(result.callee.body.nodes[0]?.ports?.['label']).toEqual({
      wire: { from: 'inputs', port: 'triggerSubject' },
    });
    const [call, third] = result.caller.body.nodes;
    expect(call?.kind).toBe('fn.call');
    expect(call?.ports?.['triggerSubject']).toEqual({ wire: { from: 'trigger', port: 'subject' } });
    expect(third?.ports?.['count']).toEqual({ wire: { from: 'makeTea', port: 'secondOut' } });
    expect(result.instanceKey).toBe('makeTea');
    expect(result.problems.caller).toBeInstanceOf(Array);
    expect(result.problems.callee).toBeInstanceOf(Array);
  });

  it('rewrites reads in steps, conditions and outputs outside the region', () => {
    const reader: FlowNode = {
      ...branching('cond', [probe('inside', { label: wired('first.out') })]),
      outputs: [{ name: 'got', values: { else: wired('first.out') } }],
    };
    const program = automation([probe('first'), reader]);
    const result = extracted(program, ['first']);
    expect(JSON.stringify(result.caller)).not.toContain('"from":"first"');
    expect(JSON.stringify(result.caller)).toContain('{"from":"makeTea","port":"firstOut"}');
    expect(result.callee.outputs[0]?.name).toBe('firstOut');
  });

  it('shares one input between repeated reads', () => {
    const program = withPress(
      automation([
        probe('first', { label: wired('trigger.subject'), wait: wired('trigger.value') }),
        probe('second', { label: wired('trigger.subject') }),
      ]),
    );
    const result = extracted(program, ['first', 'second']);
    expect(result.callee.inputs.map((port) => port.name)).toEqual([
      'triggerSubject',
      'triggerValue',
    ]);
    const ports = result.callee.body.nodes[1]?.ports;
    expect(ports?.['label']).toEqual({ wire: { from: 'inputs', port: 'triggerSubject' } });
  });

  it('turns caller inputs into inputs of the same name', () => {
    const program = {
      ...automation([probe('first', { count: wired('inputs.level') })]),
      inputs: [{ name: 'level', type: { t: 'number' }, required: false } as const],
    };
    const result = extracted(program, ['first']);
    expect(result.callee.inputs).toEqual([
      { name: 'level', type: { t: 'optional', of: { t: 'number' } }, required: true },
    ]);
    expect(result.callee.body.nodes[0]?.ports?.['count']).toEqual({
      wire: { from: 'inputs', port: 'level' },
    });
    expect(result.caller.body.nodes[0]?.ports?.['level']).toEqual({
      wire: { from: 'inputs', port: 'level' },
    });
  });

  it('refuses a caller input that collides with a port of the call', () => {
    const program = {
      ...automation([probe('first', { count: wired('inputs.fn') })]),
      inputs: [{ name: 'fn', type: { t: 'number' }, required: false } as const],
    };
    expect(refusal(program, ['first']).code).toBe('name_taken');
  });

  it('refuses reads it cannot turn into inputs', () => {
    expect(refusal(automation([probe('a', { count: wired('ghost.x') })]), ['a']).code).toBe(
      'unreadable',
    );
  });

  it('reads an output of a node outside as an input of its type', () => {
    const program = automation([probe('before'), probe('a', { label: wired('before.out') })]);
    const result = extracted(program, ['a']);
    expect(result.callee.inputs.map((port) => port.name)).toEqual(['beforeOut']);
  });

  it('types an input that points nowhere as any', () => {
    const program = automation([probe('a', { label: wired('trigger.ghost') })]);
    expect(extracted(program, ['a']).callee.inputs[0]?.type).toEqual({ t: 'any' });
  });

  it('types reads of loop scope values', () => {
    const program = automation([
      repeating('rep', [probe('a'), probe('b', { count: wired('rep.index') })]),
    ]);
    const result = extracted(program, ['b']);
    expect(result.callee.inputs[0]).toMatchObject({ name: 'repIndex' });
    expect(result.callee.inputs[0]?.type.t).toBe('number');
    expect(keysOf(result.caller)).toEqual(['rep']);
    const inner = result.caller.body.nodes[0]?.scopes?.['body']?.nodes.map((n) => n.key);
    expect(inner).toEqual(['a', 'makeTea']);
  });

  it('refuses to read a node inside a container from outside', () => {
    const program = automation([
      repeating('rep', [probe('inner')]),
      probe('after', { count: wired('inner.out') }),
    ]);
    expect(refusal(program, ['rep']).code).toBe('nested_read');
  });

  it('puts the call where the first step of the region was and keeps the others', () => {
    const program = automation([
      pure('base'),
      probe('keep1'),
      pure('shared'),
      probe('a', { label: wired('base.result') }),
      pure('between', 'shared.result'),
      probe('b', { count: wired('between.result') }),
      probe('keep3', { count: wired('shared.result') }),
    ]);
    const result = extracted(program, ['a', 'b']);
    expect(keysOf(result.caller)).toEqual(['keep1', 'shared', 'makeTea', 'keep3']);
    expect(keysOf(result.callee).slice(0, 4)).toEqual(['base', 'a', 'between', 'b']);
  });

  it('extracts pure nodes into a function that stays pure', () => {
    const program = automation([
      pure('p', undefined),
      probe('a', { label: wired('p.result') }),
      probe('z'),
    ]);
    const result = extracted(program, ['p']);
    expect(result.callee.flavour).toBe('pure');
    expect(result.callee.exits).toEqual(['done']);
    expect(result.callee.outputs.map((port) => port.name)).toEqual(['pResult']);
  });

  it('keeps a call with read nodes an action', () => {
    const program = automation([node('read', 'var.get', { name: lit('level') })]);
    const withVariable = {
      ...program,
      variables: [{ name: 'level', type: { t: 'number' }, initial: lit(0) } as const],
    };
    expect(extracted(withVariable, ['read']).callee.flavour).toBe('action');
  });

  it('lists literal references that the dialog can turn into inputs', () => {
    const program = automation([
      probe('a', { room: lit('room-1'), target: wired('trigger.x'), label: lit('x') }),
      node('tell', 'notify.person', { people: lit(['p1']) }),
      node('vget', 'var.get', { source: lit('home'), value: lit('value-1') }),
    ]);
    const result = extracted(program, ['a', 'tell', 'vget']);
    expect(result.fixed).toEqual([
      { key: 'a', port: 'room', of: 'room' },
      { key: 'tell', port: 'people', of: 'person' },
      { key: 'vget', port: 'value', of: 'value' },
    ]);
  });

  it('turns a chosen fixed pick into an input of the new node', () => {
    const program = automation([probe('a', { room: lit('room-1'), label: lit('x') })]);
    const result = extractRegion(program, ['a'], CTX, {
      functionId: FUNCTION_ID,
      name: 'Make tea',
      expose: [{ key: 'a', port: 'room' }],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.callee.inputs.map((port) => port.name)).toEqual(['aRoom']);
    expect(result.callee.body.nodes[0]?.ports?.['room']).toEqual({
      wire: { from: 'inputs', port: 'aRoom' },
    });
    expect(result.caller.body.nodes[0]?.ports?.['aRoom']).toEqual(lit('room-1'));
    expect(result.fixed).toEqual([]);
  });

  it('works on functions too and numbers repeated names', () => {
    const program = functionProgram([probe('a'), probe('b')]);
    const first = extracted(program, ['a']);
    expect(first.caller.kind).toBe('function');
    const taken = functionProgram([probe('makeTea'), probe('b')]);
    expect(extracted(taken, ['b']).instanceKey).toBe('makeTea2');
  });

  it('refuses when the new node would not be valid', () => {
    const program = functionProgram([probe('a'), giveBack({ exit: lit('Bad Exit') })], {
      exits: ['done', 'Bad Exit'],
    });
    expect(refusal(program, ['a', 'give']).code).toBe('invalid_result');
  });

  it('refuses when the rewritten program would not be valid', () => {
    const program = automation([probe('a'), probe('b')]);
    const bad = extractRegion(program, ['a'], CTX, {
      functionId: FUNCTION_ID,
      name: 'x',
      newId: () => 'not-a-uuid',
    });
    expect(bad.ok ? '' : bad.code).toBe('invalid_result');
  });

  it('refuses a node of an unknown kind inside a selected container', () => {
    const program = automation([repeating('rep', [node('weird', 'no.such', {})])]);
    expect(refusal(program, ['rep']).code).toBe('unknown_kind');
  });

  it('types a read of a port that the outside node does not have as any', () => {
    const program = automation([probe('before'), probe('a', { label: wired('before.ghost') })]);
    expect(extracted(program, ['a']).callee.inputs[0]?.type).toEqual({ t: 'any' });
  });

  it('makes up its own ids when none are given', () => {
    const program = automation([probe('a'), probe('b', { count: wired('a.out') })]);
    const result = extractRegion(program, ['a'], CTX, { functionId: FUNCTION_ID, name: 'Tea' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = detachInstance(result.caller, result.instanceKey, result.callee);
    expect(back.ok).toBe(true);
  });

  it('checks the caller with calls to other reusable nodes in it', () => {
    const other: FlowNode = node('other', 'fn.call', {
      fn: lit('55555555-5555-4555-8555-555555555555'),
    });
    const program = automation([probe('a'), other]);
    const result = extracted(program, ['a']);
    expect(result.caller.body.nodes.map((entry) => entry.key)).toEqual(['makeTea', 'other']);
  });
});
