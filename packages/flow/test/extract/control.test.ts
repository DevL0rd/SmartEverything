import type { FlowNode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  branching,
  wired,
  extracted,
  functionProgram,
  giveBack,
  keysOf,
  lit,
  node,
  probe,
  pure,
  refusal,
  repeating,
} from './support';

function breaker(target?: string): FlowNode {
  return node('stop1', 'flow.break', target === undefined ? {} : { target: lit(target) });
}

function guarding(key = 'guard1'): FlowNode {
  return node(key, 'flow.guard', { condition: lit(true) });
}

describe('loops', () => {
  it('keeps a break that leaves a loop inside the selection', () => {
    const program = automation([repeating('rep', [probe('a'), breaker()]), probe('z')]);
    expect(extracted(program, ['rep']).callee.flavour).toBe('action');
  });

  it('keeps a break that names a loop inside the selection', () => {
    const inner = repeating('inner', [breaker('outer')]);
    const program = automation([repeating('outer', [inner])]);
    expect(extracted(program, ['outer']).ok).toBe(true);
  });

  it('refuses a break that leaves a loop outside the selection', () => {
    const program = automation([repeating('rep', [probe('a'), breaker()])]);
    expect(refusal(program, ['a', 'stop1']).code).toBe('control');
    const outside = automation([repeating('rep', [probe('a'), breaker('rep')])]);
    expect(refusal(outside, ['a', 'stop1']).code).toBe('control');
  });

  it('refuses a break with no loop around it and one that names a non ancestor', () => {
    const lonely = automation([breaker()]);
    expect(refusal(lonely, ['stop1']).code).toBe('control');
    const other = automation([repeating('one', [probe('a')]), repeating('two', [breaker('one')])]);
    expect(refusal(other, ['two']).code).toBe('control');
  });

  it('refuses a break that names its loop with an expression', () => {
    const program = automation([
      repeating('rep', [node('stop1', 'flow.continue', { target: wired('trigger.x') })]),
    ]);
    expect(refusal(program, ['rep']).code).toBe('dynamic');
  });

  it('accepts a break with an empty target as the innermost loop', () => {
    const program = automation([
      repeating('rep', [node('stop1', 'flow.break', { target: lit('') })]),
    ]);
    expect(extracted(program, ['rep']).ok).toBe(true);
  });
});

describe('return', () => {
  it('turns a return at the end of the body into the end of the node', () => {
    const program = automation([probe('a'), giveBack()]);
    const result = extracted(program, ['a', 'give']);
    expect(result.callee.exits).toEqual(['done']);
    expect(keysOf(result.callee)).toEqual(['a', 'give']);
    expect(result.callee.body.nodes[1]?.ports).toEqual({});
  });

  it('refuses a return with values of the enclosing program', () => {
    const program = automation([probe('a'), giveBack({ answer: lit(1) })]);
    expect(refusal(program, ['a', 'give']).code).toBe('control');
  });

  it('refuses a return that is not at the end of the body', () => {
    const early = automation([probe('a'), giveBack(), probe('z')]);
    expect(refusal(early, ['a', 'give']).code).toBe('control');
    const nested = automation([repeating('rep', [probe('a'), giveBack()])]);
    expect(refusal(nested, ['a', 'give']).code).toBe('control');
  });

  it('adds an exit for a return of a reusable node and routes it in the caller', () => {
    const program = functionProgram([probe('a'), giveBack({ exit: lit('failed') })], {
      exits: ['done', 'failed'],
    });
    const result = extracted(program, ['a', 'give']);
    expect(result.callee.exits).toEqual(['done', 'failed']);
    expect(result.callee.body.nodes[1]?.ports).toEqual({ exit: { lit: 'failed' } });
    const call = result.caller.body.nodes[0];
    expect(call?.scopes?.['failed']?.nodes[0]).toMatchObject({
      kind: 'flow.return',
      ports: { exit: { lit: 'failed' } },
    });
  });

  it('keeps one exit for repeated returns and the default exit', () => {
    const program = functionProgram(
      [
        probe('a'),
        branching('cond', [giveBack({ exit: lit('failed') }, 'early')]),
        giveBack({ exit: lit('done') }),
      ],
      { exits: ['done', 'failed'] },
    );
    const result = extracted(program, ['a', 'cond', 'give']);
    expect(result.callee.exits).toEqual(['done', 'failed']);
  });

  it('ignores the exit of a return in an automation', () => {
    const program = automation([probe('a'), giveBack({ exit: lit('failed') })]);
    const result = extracted(program, ['a', 'give']);
    expect(result.callee.exits).toEqual(['done']);
    expect(result.callee.body.nodes[1]?.ports).toEqual({});
  });
});

describe('guard', () => {
  it('keeps a guard that ends the scope the selection ends', () => {
    const program = automation([probe('a'), guarding(), probe('b', { count: lit(1) })]);
    const result = extracted(program, ['a', 'guard1', 'b']);
    expect(keysOf(result.callee)).toEqual(['a', 'guard1', 'b']);
  });

  it('marks outputs optional when a guard can end the node early', () => {
    const program = automation([guarding(), probe('a'), pure('z', 'a.out')]);
    const result = extracted(program, ['guard1', 'a']);
    expect(result.callee.outputs).toEqual([
      { name: 'aOut', type: { t: 'number', integer: true }, optional: true },
    ]);
  });

  it('refuses a guard that ends the scope when more steps follow the selection', () => {
    const program = automation([probe('a'), guarding(), probe('z')]);
    expect(refusal(program, ['a', 'guard1']).code).toBe('control');
  });

  it('keeps a guard that sits deeper than the selection top level', () => {
    const program = automation([branching('cond', [guarding()]), probe('z')]);
    const result = extracted(program, ['cond']);
    expect(result.callee.outputs).toEqual([]);
  });
});

describe('what cannot move', () => {
  it('refuses nodes that keep memory', () => {
    const program = automation([node('wait1', 'timing.cooldown', { period: lit(1000) })]);
    expect(refusal(program, ['wait1']).code).toBe('stateful');
  });

  it('refuses triggers placed in a body', () => {
    const program = automation([node('t1', 'trigger.signal')]);
    expect(refusal(program, ['t1']).code).toBe('trigger');
  });
});

describe('return without ports', () => {
  it('leaves by the default exit when a reusable node returns without one', () => {
    const bare: FlowNode = {
      id: '44444444-4444-4444-8444-444444444444',
      key: 'give',
      kind: 'flow.return',
    };
    const program = functionProgram([probe('a'), bare]);
    const result = extracted(program, ['a', 'give']);
    expect(result.callee.exits).toEqual(['done']);
  });
});
